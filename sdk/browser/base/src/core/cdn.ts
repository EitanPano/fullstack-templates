import { createSdk, type Sdk } from './sdk'
import type { ModuleDeclaration } from './types'

// The calls a queue entry may name. `report` and `whenSettled` are the kernel's own.
const CALLS = ['init', 'mount', 'open', 'on', 'setConsent', 'setTheme', 'destroy'] as const

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
 * boundary; and nothing here throws into the page. A queue an inline stub filled is run in three
 * steps: its calls (`['init', {...}]`) in order, then the tag's own `data-key`, so a page with a
 * strict policy needs no inline script at all, then its functions, each called with the global
 * (`(sdk) => { sdk.mount(...) }`) once the tag has started the SDK. The global's `push` runs an
 * entry the same way, so the usual stub works whether it runs before or after the file. Only the
 * global has `push`; the npm entry does not.
 */
export function installCdn({ sdk, globalName, win, script }: InstallOptions): void {
  try {
    const existing = win[globalName]
    if (isRecord(existing) && existing['version'] === sdk.version) return
    if (existing !== undefined && existing !== null && !Array.isArray(existing)) {
      sdk.report('global_taken')
      return
    }
    const runCall = (entry: unknown) => {
      if (!Array.isArray(entry)) return
      const [name, ...args] = entry as unknown[]
      if (!(CALLS as readonly unknown[]).includes(name)) return
      try {
        ;(sdk[name as (typeof CALLS)[number]] as (...a: unknown[]) => unknown)(...args)
      } catch {
        // The public calls never throw; a stub entry that does is dropped.
      }
    }
    const runFunction = (entry: unknown) => {
      if (typeof entry !== 'function') return
      try {
        ;(entry as (api: unknown) => unknown)(api)
      } catch {
        // A page's function failing is the page's: it never stops the next.
      }
    }
    const api = {
      init: sdk.init,
      mount: sdk.mount,
      open: sdk.open,
      on: sdk.on,
      setConsent: sdk.setConsent,
      setTheme: sdk.setTheme,
      destroy: sdk.destroy,
      version: sdk.version,
      push(...entries: unknown[]) {
        for (const entry of entries) {
          runCall(entry)
          runFunction(entry)
        }
      },
    }
    win[globalName] = api
    const queue = Array.isArray(existing) ? (existing as unknown[]) : []
    for (const entry of queue) runCall(entry)
    const key = script?.getAttribute('data-key')
    // The tag opts in to watching: the attribute's presence counts, `false` turns it off.
    const observe =
      script?.hasAttribute('data-observe') && script.getAttribute('data-observe') !== 'false'
    if (key) sdk.init({ key, ...(observe ? { observe: true } : {}) })
    for (const entry of queue) runFunction(entry)
  } catch {
    sdk.report('internal')
  }
}

/**
 * The CDN entry's whole job: build the kernel with the modules this build declares, default the
 * API to the origin the script came from, and install the global. Where there is no window it
 * does nothing.
 */
export function bootCdn(options: {
  modules: ModuleDeclaration[]
  globalName: string
  slotAttribute: string
}): void {
  if (typeof window === 'undefined') return
  try {
    const current = document.currentScript
    const script = current instanceof HTMLScriptElement ? current : null
    installCdn({
      sdk: createSdk({
        modules: options.modules,
        slotAttribute: options.slotAttribute,
        defaultApiOrigin: scriptOrigin(script),
      }),
      globalName: options.globalName,
      win: window as unknown as Record<string, unknown>,
      script,
    })
  } catch {
    // Nothing a guest does throws into the page it is on.
  }
}
