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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Puts the one global on the page: the same surface as the npm entry. The page owns its names, so
 * this is a guest: a global that already is this SDK's (it has our `version`) means a second tag,
 * which does nothing; any other value that is not a queue is left alone and reported through the
 * boundary; and nothing here throws into the page. A queue (`window.Name = [['init', {...}]]`) an
 * inline stub filled is run first, then the tag's own `data-key`, so a page with a strict policy
 * needs no inline script at all.
 */
export function installCdn({ sdk, globalName, win, script }: InstallOptions): void {
  try {
    const existing = win[globalName]
    if (isRecord(existing) && existing['version'] === sdk.version) return
    if (existing !== undefined && existing !== null && !Array.isArray(existing)) {
      sdk.report(new Error(`${globalName} is already used on this page: the SDK is not installed`))
      return
    }
    win[globalName] = {
      init: sdk.init,
      destroy: sdk.destroy,
      on: sdk.on,
      setConsent: sdk.setConsent,
      version: sdk.version,
    }
    if (Array.isArray(existing)) {
      for (const entry of existing) {
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
  } catch (error) {
    sdk.report(error)
  }
}

/**
 * The CDN entry's whole job: build the kernel with the features this build ships, default the API
 * to the origin the script came from, and install the global. Where there is no window it does nothing.
 */
export function bootCdn(options: { modules: HostModule[]; globalName: string }): void {
  if (typeof window === 'undefined') return
  try {
    const current = document.currentScript
    const script = current instanceof HTMLScriptElement ? current : null
    installCdn({
      sdk: createSdk({ modules: options.modules, defaultApiOrigin: scriptOrigin(script) }),
      globalName: options.globalName,
      win: window as unknown as Record<string, unknown>,
      script,
    })
  } catch {
    // Nothing a guest does throws into the page it is on.
  }
}
