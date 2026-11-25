import { isConsentState, isKey, own, parseTheme, type ConsentState, type Theme } from '../protocol'
import type { SdkConfig } from '../contract'

import type { ErrorCode, InitOptions } from './types'

export type ResolvedConfig = {
  key: string
  apiOrigin: string
  theme: Theme | undefined
  consent: ConsentState | undefined
  observe: boolean
}

/** A theme from the host: the values that match their pattern, or nothing for a non-object. */
export function themeOf(value: unknown): Theme | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? parseTheme({ ...value })
    : undefined
}

/**
 * Checks what the host passed. A bad option is a code the caller reports, never a throw. Options
 * are read as own properties only, so a polluted `Object.prototype` supplies none.
 */
export function resolveConfig(
  options: unknown,
  defaultApiOrigin: string | undefined,
): ResolvedConfig | ErrorCode {
  if (typeof options !== 'object' || options === null) return 'bad_options'
  const raw = options as Partial<InitOptions>
  const key = own(raw, 'key')
  if (!isKey(key)) return 'bad_key'
  const origin = own(raw, 'apiOrigin') ?? defaultApiOrigin
  if (!origin) return 'no_api_origin'
  let apiOrigin: string
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol')
    apiOrigin = url.origin
  } catch {
    return 'bad_api_origin'
  }
  const consent = own(raw, 'consent')
  return {
    key,
    apiOrigin,
    theme: themeOf(own(raw, 'theme')),
    consent: isConsentState(consent) ? consent : undefined,
    observe: own(raw, 'observe') === true,
  }
}

/** The server's answer is data from another origin: check its shape against the contract type. */
export function isSdkConfig(data: unknown): data is SdkConfig {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { enabled?: unknown }).enabled === 'boolean'
  )
}
