import { isConsentState, parseTheme, type ConsentState, type Theme } from '../protocol'
import type { SdkConfig } from '../contract'

import type { InitOptions } from './types'

export type ResolvedConfig = {
  key: string
  apiOrigin: string
  theme: Theme
  consent: ConsentState | undefined
}

const KEY = /^[A-Za-z0-9_-]{1,200}$/

/** Checks what the host passed. A bad option is reported by the caller, never thrown. */
export function resolveConfig(
  options: unknown,
  defaultApiOrigin: string | undefined,
): ResolvedConfig | string {
  if (typeof options !== 'object' || options === null) return 'init needs an options object'
  const raw = options as Partial<InitOptions>
  if (typeof raw.key !== 'string' || !KEY.test(raw.key)) {
    return 'init needs a key of letters, digits, _ and -'
  }
  const origin = raw.apiOrigin ?? defaultApiOrigin
  if (!origin) return 'init needs an apiOrigin: this build has no default'
  let apiOrigin: string
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol')
    apiOrigin = url.origin
  } catch {
    return 'apiOrigin is not an http(s) origin'
  }
  return {
    key: raw.key,
    apiOrigin,
    theme: raw.theme && typeof raw.theme === 'object' ? parseTheme({ ...raw.theme }) : {},
    consent: isConsentState(raw.consent) ? raw.consent : undefined,
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
