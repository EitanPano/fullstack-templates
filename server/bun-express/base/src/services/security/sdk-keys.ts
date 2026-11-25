// sdk-keys.ts belongs: the resolver from a publishable SDK key to the origins it may be used
// from. The default reads SDK_KEYS through config/env.ts, which has already checked every key and
// origin; a product that stores keys replaces these bodies with a lookup and keeps the
// signatures. It does not belong: the gate that uses it (middleware/sdk-gate.ts) or any secret,
// since a key identifies an integration and grants nothing alone.
import { env } from '../../config/env'

// The origins `key` may be used from, or undefined for an unknown, empty or missing key.
export function originsForKey(key: string | undefined): readonly string[] | undefined {
  if (key === undefined || key === '') return undefined
  return env.SDK_KEYS?.get(key)
}

// Whether any key lists `origin`. A preflight carries no key, so it is answered on this. A
// lookup-backed resolver must answer it from a cache: it runs on unauthenticated preflights.
export function isListedOrigin(origin: string | undefined): boolean {
  if (origin === undefined || env.SDK_KEYS === undefined) return false
  for (const origins of env.SDK_KEYS.values()) {
    if (origins.includes(origin)) return true
  }
  return false
}
