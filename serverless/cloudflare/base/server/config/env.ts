// env.ts belongs: the one place that reads the request's bindings as configuration. The zod schema
// validates them, once per isolate (the result is cached on the bindings object), and a missing
// or malformed value stops the request with a message naming it (never its value). A fresh clone
// runs with no env file: every variable has a default or is optional. A secret has no default: it
// is optional until a feature needs it, and a value that is set must be valid in every
// environment. A variable the product adds is declared here and in `.env.example`.
// It does not belong: policy constants (constants.ts) or the database binding (infra/bindings.ts).
import { z } from 'zod'

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
  // Optional, no default: nothing in the template encrypts anything yet. The feature that first
  // calls `encrypt` reads it through requireEncryptionKey and sets it in every environment.
  ENCRYPTION_KEY: z.preprocess(blankIsUnset, encryptionKey.optional()),
  // Multiplies every limit in RATE_LIMITS (middleware/rate-limit.ts). An e2e run sets it so a
  // journey suite does not trip the limits; production keeps 1. At most 1000, so no value is a
  // bypass.
  RATE_LIMIT_SCALE: z.preprocess(blankIsUnset, z.coerce.number().min(1).max(1000).default(1)),
  LOG_LEVEL: z.preprocess(blankIsUnset, z.enum(['debug', 'info', 'warn', 'error']).default('info')),
})

export type Config = z.output<typeof schema>

export function parseConfig(source: Record<string, unknown>): Config {
  const result = schema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`invalid environment: ${issues}`)
  }
  return result.data
}

// Per isolate, keyed on the bindings object the platform hands every request of that isolate.
const parsed = new WeakMap<object, Config>()

export function getConfig(bindings: object): Config {
  const cached = parsed.get(bindings)
  if (cached !== undefined) return cached
  const config = parseConfig(bindings as Record<string, unknown>)
  parsed.set(bindings, config)
  return config
}

// The key for the feature that first encrypts something: it fails the request, naming the
// variable, when the deployment has not set it.
export function requireEncryptionKey(config: Config): string {
  if (config.ENCRYPTION_KEY === undefined) {
    throw new Error('invalid environment: ENCRYPTION_KEY is not set')
  }
  return config.ENCRYPTION_KEY
}
