// env.ts belongs: the one place that reads the request's bindings as configuration. The zod schema
// validates them, once per isolate (the result is cached on the bindings object), and a missing
// or malformed value stops the request with a message naming it (never its value). A fresh clone
// runs with no env file: every variable has a development default or is optional, except a secret
// in production, which must be supplied; elsewhere it falls back to a plainly fake default and
// the first parse warns once. A variable the product adds is declared here and in `.env.example`.
// It does not belong: policy constants (constants.ts) or the database binding (infra/bindings.ts).
// It imports nothing from server/: the caller passes the function that logs the one warning.
import { z } from 'zod'

const SECRET_NAMES = ['ENCRYPTION_KEY'] as const
type SecretName = (typeof SECRET_NAMES)[number]

// 32 bytes, base64: plainly fake, so a copied default is recognised and refused in production.
const DEVELOPMENT_DEFAULTS: Record<SecretName, string> = {
  ENCRYPTION_KEY: btoa('dev-only-encryption-key-01234567'),
}

const blankIsUnset = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const encryptionKey = z.string().refine(
  (value) => {
    try {
      return atob(value).length === 32
    } catch {
      return false
    }
  },
  { message: 'must be base64 that decodes to 32 bytes' },
)

const schema = z.object({
  // Required: Pages sets it per environment in wrangler.jsonc, so a missing one is a deploy fault.
  ENVIRONMENT: z.enum(['development', 'test', 'preview', 'production']),
  ENCRYPTION_KEY: encryptionKey,
  // Multiplies every limit in RATE_LIMITS (middleware/rate-limit.ts). An e2e run sets it so a
  // journey suite does not trip the limits; production keeps 1. At most 1000, so no value is a
  // bypass.
  RATE_LIMIT_SCALE: z.preprocess(blankIsUnset, z.coerce.number().min(1).max(1000).default(1)),
  LOG_LEVEL: z.preprocess(blankIsUnset, z.enum(['debug', 'info', 'warn', 'error']).default('info')),
})

export type Config = z.output<typeof schema>

// A copied example file or the development default must not reach production: the secret would
// be public. Only the name is reported, never the value.
function placeholderProblems(source: Record<string, unknown>): string[] {
  const problems: string[] = []
  for (const name of SECRET_NAMES) {
    const value = source[name]
    if (typeof value !== 'string' || value === '') continue
    if (value.startsWith('change-me') || value === DEVELOPMENT_DEFAULTS[name]) {
      problems.push(`${name}: is a placeholder, set a real secret`)
    }
  }
  return problems
}

export function parseConfig(source: Record<string, unknown>): {
  config: Config
  defaulted: SecretName[]
} {
  const production = source.ENVIRONMENT === 'production'
  const defaulted: SecretName[] = []
  const withDefaults: Record<string, unknown> = { ...source }
  if (!production) {
    for (const name of SECRET_NAMES) {
      const value = source[name]
      if (value === undefined || (typeof value === 'string' && value === '')) {
        withDefaults[name] = DEVELOPMENT_DEFAULTS[name]
        defaulted.push(name)
      }
    }
  } else {
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
  return { config: result.data, defaulted }
}

// Per isolate, keyed on the bindings object the platform hands every request of that isolate.
const parsed = new WeakMap<object, Config>()

export function getConfig(
  bindings: object,
  warn: (message: string) => void = () => undefined,
): Config {
  const cached = parsed.get(bindings)
  if (cached !== undefined) return cached
  const { config, defaulted } = parseConfig(bindings as Record<string, unknown>)
  parsed.set(bindings, config)
  if (defaulted.length > 0) {
    warn(
      `using the development default for ${defaulted.join(', ')}; set a real value before production`,
    )
  }
  return config
}
