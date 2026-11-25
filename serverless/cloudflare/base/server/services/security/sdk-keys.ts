// sdk-keys.ts belongs: the resolver from a publishable SDK key to the origins it may be used
// from. The default reads SDK_KEYS from the validated configuration, which has already checked
// every key and origin; a product that stores keys replaces these bodies with a lookup (a binding
// is the request's, so a lookup takes it from `ctx.bindings`) and keeps the shape. It does not
// belong: the gate that uses it (middleware/sdk-gate.ts) or any secret, since a key identifies an
// integration and grants nothing alone.
import type { Config } from '../../config/env'

// The origins `key` may be used from, or undefined for an unknown, empty or missing key.
export function originsForKey(
  config: Pick<Config, 'SDK_KEYS'>,
  key: string | undefined,
): readonly string[] | undefined {
  if (key === undefined || key === '') return undefined
  return config.SDK_KEYS?.get(key)
}

// Whether any key lists `origin`. A preflight carries no key, so it is answered on this. A
// lookup-backed resolver must answer it from a cache: it runs on unauthenticated preflights.
export function isListedOrigin(
  config: Pick<Config, 'SDK_KEYS'>,
  origin: string | undefined,
): boolean {
  if (origin === undefined || config.SDK_KEYS === undefined) return false
  for (const origins of config.SDK_KEYS.values()) {
    if (origins.includes(origin)) return true
  }
  return false
}
