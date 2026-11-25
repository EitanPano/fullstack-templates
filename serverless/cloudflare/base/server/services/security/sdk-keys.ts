// sdk-keys.ts belongs: the resolver from a publishable SDK key to its record, read from SDK_KEYS;
// a product that stores keys replaces both bodies with a lookup (a binding is on `ctx.bindings`).
// Both answer from a cache, misses too: the key step and the frame document run before any limit,
// so every request with a made-up key costs one lookup. A lookup that throws is never a valid key.
import type { Config } from '../../config/env'

export type SdkKey = { origins: readonly string[]; enabled: boolean }

// The record of `key`, or undefined for an unknown, empty or missing key.
export async function resolveKey(
  config: Pick<Config, 'SDK_KEYS'>,
  key: string | undefined,
): Promise<SdkKey | undefined> {
  if (key === undefined || key === '') return undefined
  const origins = config.SDK_KEYS?.get(key)
  return origins === undefined ? undefined : { origins, enabled: true }
}

// Whether any key lists `origin`: a preflight carries no key, so it is answered on this.
export async function isListedOrigin(
  config: Pick<Config, 'SDK_KEYS'>,
  origin: string | undefined,
): Promise<boolean> {
  if (origin === undefined || config.SDK_KEYS === undefined) return false
  for (const origins of config.SDK_KEYS.values()) {
    if (origins.includes(origin)) return true
  }
  return false
}
