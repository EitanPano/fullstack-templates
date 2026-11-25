import { statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { z } from 'zod'

// The only file that reads process.env. Parsed once at startup; a missing or malformed
// variable stops the process with a message naming it. A fresh clone runs with no env file
// at all: every variable has a development default or is optional, except the secrets in
// production, which must be supplied (outside production they fall back to a plainly fake
// default and `defaultedSecrets` names them so the entry can warn). A variable the
// product adds (a database URL, a provider key) is declared here and in the example env file. // @nodatabase
// product adds (a provider key) is declared here and in the example env file. // @database
const SECRET_NAMES = [
  'JWT_ACCESS_SECRET', // @auth
  'JWT_REFRESH_SECRET', // @auth
  'OTP_SECRET', // @auth
  'ENCRYPTION_KEY',
  'DATABASE_URL', // @database
] as const
type SecretName = (typeof SECRET_NAMES)[number]

const DEVELOPMENT_DEFAULTS: Record<SecretName, string> = {
  JWT_ACCESS_SECRET: 'dev-only-access-secret-change-me-0123456789', // @auth
  JWT_REFRESH_SECRET: 'dev-only-refresh-secret-change-me-012345678', // @auth
  OTP_SECRET: 'dev-only-otp-secret-change-me-0123456789abc', // @auth
  // 32 bytes, base64.
  ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  // The provider's local service. The URL carries the password, so it is a secret.
  DATABASE_URL: 'postgres://app:app@127.0.0.1:5432/app', // @database:postgres
}

const BLANK_IS_UNSET = ['CORS_ORIGINS', 'COOKIE_DOMAIN', 'MAIL_FROM', 'TRUST_PROXY'] as const // @auth
const BLANK_IS_UNSET = ['CORS_ORIGINS', 'MAIL_FROM', 'TRUST_PROXY'] as const // @noauth

// @auth-start
const MIN_SECRET_LENGTH = 32

const secret = z
  .string()
  .min(MIN_SECRET_LENGTH, `must be at least ${String(MIN_SECRET_LENGTH)} characters`)
// @auth-end

const encryptionKey = z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
  message: 'must be base64 that decodes to 32 bytes',
})

// @database:postgres-start
const databaseUrl = z.string().refine((value) => /^postgres(?:ql)?:\/\//.test(value), {
  message: 'must be a postgres:// or postgresql:// URL',
})
// The provider's e2e database: same server and credentials as the development one. A blank is
// unset (Compose passes one), so a server that never uses it still boots.
const e2eDatabaseUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  databaseUrl.default('postgres://app:app@127.0.0.1:5432/app_e2e'),
)

// @database:postgres-end
// Express accepts a boolean, a hop count or a subnet/address list for `trust proxy`.
const trustProxy = z
  .string()
  .default('false')
  .transform((value): boolean | number | string => {
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^\d+$/.test(value)) return Number(value)
    return value
  })

const booleanText = z.enum(['true', 'false']).transform((value) => value === 'true')

// @sdk-start
// A key is publishable and an origin goes verbatim into a response header (frame-ancestors), so
// each is checked against a closed form. An origin is the exact text a browser sends: lower-case
// scheme and host, an optional non-default port, no path, no wildcard.
const SDK_KEY = /^[A-Za-z0-9_.-]{1,128}$/
const SDK_ORIGIN = /^https?:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/

export function isOrigin(value: string): boolean {
  if (!SDK_ORIGIN.test(value)) return false
  try {
    return new URL(value).origin === value
  } catch {
    return false
  }
}

function isWeakOrigin(origin: string): boolean {
  const { protocol, hostname } = new URL(origin)
  return protocol === 'http:' || hostname === 'localhost' || hostname.startsWith('127.')
}

const blankIsUnset = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

// The origins the frame document may load images from: the same closed form, joined by commas.
const sdkImgOrigins = z
  .string()
  .trim()
  .optional()
  .transform((value, context): string[] => {
    if (value === undefined || value === '') return []
    const list = value.split(',').map((origin) => origin.trim())
    if (!list.every(isOrigin)) {
      context.addIssue({
        code: 'custom',
        message: 'must be origins (scheme://host[:port], in lower case) separated by commas',
      })
      return z.NEVER
    }
    return list
  })

// `key=origin,origin;key=origin`. A refusal names the pair by position and never the key.
const sdkKeys = z
  .string()
  .trim()
  .optional()
  .transform((value, context): Map<string, string[]> | undefined => {
    if (value === undefined || value === '') return undefined
    const keys = new Map<string, string[]>()
    const refuse = (message: string) => {
      context.addIssue({ code: 'custom', message })
      return z.NEVER
    }
    const pairs = value.split(';').map((pair) => pair.trim())
    if (pairs.at(-1) === '') pairs.pop()
    for (const [index, pair] of pairs.entries()) {
      const at = `pair ${String(index + 1)}`
      const [key = '', origins = '', ...rest] = pair.split('=').map((part) => part.trim())
      if (rest.length > 0 || origins === '') return refuse(`${at} must be key=origin[,origin]`)
      if (!SDK_KEY.test(key)) return refuse(`${at} has a key outside A-Z a-z 0-9 _ . -`)
      if (keys.has(key)) return refuse(`${at} repeats an earlier key`)
      const list = origins.split(',').map((origin) => origin.trim())
      if (!list.every(isOrigin)) {
        return refuse(`${at} has an origin that is not scheme://host[:port] in lower case`)
      }
      keys.set(key, list)
    }
    return keys
  })

// @sdk-end
const provider = z.string().min(1).default('console')

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    TRUST_PROXY: trustProxy,
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((value) =>
        value === undefined
          ? undefined
          : value
              .split(',')
              .map((origin) => origin.trim())
              .filter((origin) => origin !== ''),
      ),
    // The built SPA to serve, resolved once to an absolute path; blank is unset and serves none.
    STATIC_DIR: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === '' ? undefined : resolve(value))),
    // @sdk-start
    // The SDK namespace: publishable keys with their origins, the kill switch GET /api/sdk/v1/config
    // answers, and the SDK's CDN build to serve. A blank value is unset; unset SDK_DIR means both
    // file routes answer 404 and unset SDK_KEYS means every namespace request is refused.
    SDK_KEYS: sdkKeys,
    SDK_ENABLED: z.preprocess(blankIsUnset, booleanText.default(true)),
    // Origins the frame document may load images from, on top of its own.
    SDK_IMG_ORIGINS: sdkImgOrigins,
    SDK_DIR: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === '' ? undefined : resolve(value))),
    // @sdk-end
    JWT_ACCESS_SECRET: secret, // @auth
    JWT_REFRESH_SECRET: secret, // @auth
    OTP_SECRET: secret, // @auth
    ENCRYPTION_KEY: encryptionKey,
    DATABASE_URL: databaseUrl, // @database:postgres
    // The e2e database `bun run db:e2e` prepares; the app itself never connects to it unless a
    // run starts it with DATABASE_URL set to this value.
    E2E_DATABASE_URL: e2eDatabaseUrl, // @database:postgres
    COOKIE_DOMAIN: z.string().trim().min(1).optional(), // @auth
    MAIL_PROVIDER: provider,
    SMS_PROVIDER: provider,
    WHATSAPP_PROVIDER: provider,
    MAIL_FROM: z.string().min(1).optional(),
    JOBS_ENABLED: booleanText.default(true),
    // Multiplies every limit in RATE_LIMITS (middleware/rate-limit.ts). An e2e run sets it so a
    // journey suite does not trip the limits; production keeps 1. At most 1000, so no value is a
    // bypass.
    RATE_LIMIT_SCALE: z.coerce.number().min(1).max(1000).default(1),
  })
  .transform((value, context) => {
    // @sdk-start
    // Production serves other people's pages: a key may not list an http or a loopback origin.
    let position = 0
    for (const origins of value.SDK_KEYS?.values() ?? []) {
      position++
      if (value.NODE_ENV === 'production' && origins.some(isWeakOrigin)) {
        context.addIssue({
          code: 'custom',
          path: ['SDK_KEYS'],
          message: `pair ${String(position)} has an http or loopback origin, which production refuses`,
        })
        return z.NEVER
      }
    }
    if (value.NODE_ENV === 'production' && value.SDK_IMG_ORIGINS.some(isWeakOrigin)) {
      context.addIssue({
        code: 'custom',
        path: ['SDK_IMG_ORIGINS'],
        message: 'has an http or loopback origin, which production refuses',
      })
      return z.NEVER
    }
    // @sdk-end
    if (value.MAIL_PROVIDER !== 'console' && value.MAIL_FROM === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['MAIL_FROM'],
        message: 'is required when MAIL_PROVIDER is not console',
      })
      return z.NEVER
    }
    return { ...value, MAIL_FROM: value.MAIL_FROM ?? 'no-reply@example.com' }
  })

export type Env = z.output<typeof schema>
export type TrustProxy = Env['TRUST_PROXY']

// A copied example file or the development default must not reach production: the secrets
// would be public. Only the name is reported, never the value.
function placeholderProblems(source: Record<string, string | undefined>): string[] {
  const problems: string[] = []
  for (const name of SECRET_NAMES) {
    const value = source[name]
    if (value === undefined || value === '') continue
    if (
      value.startsWith('change-me') ||
      value.startsWith('dev-only-') ||
      value === DEVELOPMENT_DEFAULTS[name]
    ) {
      problems.push(`${name}: is a placeholder, set a real secret`)
    }
  }
  // @auth-start
  const access = source.JWT_ACCESS_SECRET
  if (access !== undefined && access !== '' && access === source.JWT_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET')
  }
  // @auth-end
  return problems
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): {
  env: Env
  defaultedSecrets: string[]
} {
  const production = source.NODE_ENV === 'production'
  const defaultedSecrets: string[] = []
  const withDefaults: Record<string, string | undefined> = { ...source }
  // Docker Compose passes an unset `${VAR}` as an empty string; blank means unset.
  for (const name of BLANK_IS_UNSET) {
    if (source[name]?.trim() === '') withDefaults[name] = undefined
  }
  if (!production) {
    for (const name of SECRET_NAMES) {
      if (source[name] === undefined || source[name] === '') {
        withDefaults[name] = DEVELOPMENT_DEFAULTS[name]
        defaultedSecrets.push(name)
      }
    }
  }

  if (production) {
    const problems = placeholderProblems(source)
    if (problems.length > 0) throw new Error(`invalid environment: ${problems.join('; ')}`)
  }

  const result = schema.safeParse(withDefaults)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`invalid environment: ${issues}`)
  }
  const staticDir = result.data.STATIC_DIR
  if (production && staticDir !== undefined && !isFile(join(staticDir, 'index.html'))) {
    throw new Error(`invalid environment: STATIC_DIR: ${staticDir} has no index.html`)
  }
  return { env: result.data, defaultedSecrets }
}

export const { env, defaultedSecrets } = loadEnv()
