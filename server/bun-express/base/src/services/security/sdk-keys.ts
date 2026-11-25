// sdk-keys.ts belongs: the resolver from a publishable SDK key to the origins it may be used
// from and whether it is switched on. The default reads SDK_KEYS through config/env.ts and
// switches every key on; a product that stores keys replaces these bodies with a lookup, and a
// lookup that throws is a 500 in the gate, never a valid key. Both functions must answer from a
// cache, misses too: the key step and the frame document run before any limit, so every request
// with a made-up key costs one lookup. A record's origins keep the closed form of SDK_KEYS.
import { env } from '../../config/env'

export type SdkKeyRecord = { origins: readonly string[]; enabled: boolean }

// The record of `key`, or undefined for an unknown, empty or missing key.
export function resolveKey(key: string | undefined): Promise<SdkKeyRecord | undefined> {
  if (key === undefined || key === '') return Promise.resolve(undefined)
  const origins = env.SDK_KEYS?.get(key)
  return Promise.resolve(origins === undefined ? undefined : { origins, enabled: true })
}

// Whether any key lists `origin`. A preflight carries no key, so it is answered on this.
export function isListedOrigin(origin: string | undefined): Promise<boolean> {
  if (origin === undefined || env.SDK_KEYS === undefined) return Promise.resolve(false)
  for (const origins of env.SDK_KEYS.values()) {
    if (origins.includes(origin)) return Promise.resolve(true)
  }
  return Promise.resolve(false)
}
