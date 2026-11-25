import { createSdk, type Sdk } from './sdk'
import type { HostModule } from './types'

const CALLS = ['init', 'destroy', 'on', 'setConsent'] as const

/** The origin the loader was fetched from: where the API is, unless the host says otherwise. */
export function scriptOrigin(script: HTMLScriptElement | null): string | undefined {
  try {
    const src = script?.getAttribute('src')
    if (!src) return undefined
    const url = new URL(src, script?.ownerDocument.baseURI)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined
  } catch {
    return undefined
  }
}

export type InstallOptions = {
  sdk: Sdk
  globalName: string
  win: Record<string, unknown>
  script: HTMLScriptElement | null
}

/**
 * Puts the one global on the page: the same surface as the npm entry. It first runs what an
 * inline stub queued (`window.Name = [['init', {...}]]`), then the tag's own `data-key`, so a
 * page with a strict policy needs no inline script at all.
 */
export function installCdn({ sdk, globalName, win, script }: InstallOptions): void {
  const queued = win[globalName]
  win[globalName] = {
    init: sdk.init,
    destroy: sdk.destroy,
    on: sdk.on,
    setConsent: sdk.setConsent,
    version: sdk.version,
  }
  if (Array.isArray(queued)) {
    for (const entry of queued) {
      if (!Array.isArray(entry)) continue
      const [name, ...args] = entry as unknown[]
      if ((CALLS as readonly unknown[]).includes(name)) {
        try {
          ;(sdk[name as (typeof CALLS)[number]] as (...a: unknown[]) => unknown)(...args)
        } catch {
          // The public calls never throw; a stub entry that does is dropped.
        }
      }
    }
  }
  const key = script?.getAttribute('data-key')
  if (key) sdk.init({ key })
}

/**
 * The CDN entry's whole job: build the kernel with the features this build ships, default the API
 * to the origin the script came from, and install the global. Where there is no window it does nothing.
 */
export function bootCdn(options: { modules: HostModule[]; globalName: string }): void {
  if (typeof window === 'undefined') return
  const current = document.currentScript
  const script = current instanceof HTMLScriptElement ? current : null
  installCdn({
    sdk: createSdk({ modules: options.modules, defaultApiOrigin: scriptOrigin(script) }),
    globalName: options.globalName,
    win: window as unknown as Record<string, unknown>,
    script,
  })
}
