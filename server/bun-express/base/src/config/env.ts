import { z } from 'zod'

// The only file that reads process.env. Parsed once at startup; a missing or malformed
// variable stops the process with a message naming it. A fresh clone runs with no env file
// @auth-start
// at all: every variable has a development default or is optional, except the four secrets
// in production, which must be supplied (outside production they fall back to a plainly
// fake default and `defaultedSecrets` names them so the entry can warn). A variable the
// @auth-end
// @noauth-start
// at all: every variable has a development default or is optional, except the encryption
// key in production, which must be supplied (outside production it falls back to a plainly
// fake default and `defaultedSecrets` names it so the entry can warn). A variable the
// @noauth-end
// product adds (a database URL, a provider key) is declared here and in the example env file.
const SECRET_NAMES = [
  'JWT_ACCESS_SECRET', // @auth
  'JWT_REFRESH_SECRET', // @auth
  'OTP_SECRET', // @auth
  'ENCRYPTION_KEY',
] as const
type SecretName = (typeof SECRET_NAMES)[number]

const DEVELOPMENT_DEFAULTS: Record<SecretName, string> = {
  JWT_ACCESS_SECRET: 'dev-only-access-secret-change-me-0123456789', // @auth
  JWT_REFRESH_SECRET: 'dev-only-refresh-secret-change-me-012345678', // @auth
  OTP_SECRET: 'dev-only-otp-secret-change-me-0123456789abc', // @auth
  // 32 bytes, base64.
  ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
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
    JWT_ACCESS_SECRET: secret, // @auth
    JWT_REFRESH_SECRET: secret, // @auth
    OTP_SECRET: secret, // @auth
    ENCRYPTION_KEY: encryptionKey,
    COOKIE_DOMAIN: z.string().trim().min(1).optional(), // @auth
    MAIL_PROVIDER: provider,
    SMS_PROVIDER: provider,
    WHATSAPP_PROVIDER: provider,
    MAIL_FROM: z.string().min(1).optional(),
    JOBS_ENABLED: booleanText.default(true),
  })
  .transform((value, context) => {
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
  return { env: result.data, defaultedSecrets }
}

export const { env, defaultedSecrets } = loadEnv()
