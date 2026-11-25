import type { Page } from '@playwright/test'

import { LOADER_URL, SDK_KEY } from './hosts'

export type HostEvent = { name: string; occlusion?: string; message?: string }

type Hooked = { __sdkEvents?: HostEvent[]; __SDK_GLOBAL__?: unknown }

/**
 * Starts the SDK on a page that carries no tag: the host's own script does what the tag would
 * (a queued call, then the script element). Events the host sees are collected on the page,
 * registered through the queue so none is missed. `consent` is the `init` option.
 */
export async function loadSdk(
  page: Page,
  options: {
    consent?: 'granted' | 'denied'
    key?: string
    loader?: string
    theme?: Record<string, string>
  } = {},
): Promise<void> {
  await page.evaluate(
    ({ consent, key, loader, theme }) => {
      const win = window as unknown as Hooked & Record<string, unknown>
      win.__sdkEvents = []
      const collect = (event: unknown) => win.__sdkEvents?.push(event as HostEvent)
      const queue: unknown[][] = (['rendered', 'viewed', 'clicked', 'error'] as const).map(
        (name) => ['on', name, collect],
      )
      queue.push(['init', { key, ...(consent ? { consent } : {}), ...(theme ? { theme } : {}) }])
      win['__SDK_GLOBAL__'] = queue
      const script = document.createElement('script')
      script.async = true
      script.src = loader
      document.head.appendChild(script)
    },
    {
      consent: options.consent,
      key: options.key ?? SDK_KEY,
      loader: options.loader ?? LOADER_URL,
      theme: options.theme,
    },
  )
}

export function hostEvents(page: Page): Promise<HostEvent[]> {
  return page.evaluate(() => (window as unknown as Hooked).__sdkEvents ?? [])
}

/** What a test needs of the engine: where the table of ADR 0020 F4 differs. */
export type Engine = 'chromium' | 'firefox' | 'webkit'

/**
 * Records what a page does that the e2e asserts on, in every frame, before any script of the
 * page runs: policy violations, uncaught errors, unhandled rejections and the listeners a script
 * adds to `window` or the document once `armed` is set. It sits behind a non-enumerable property
 * that exists in both property snapshots a test compares.
 */
export function recorder(): void {
  const log = {
    armed: false,
    violations: [] as string[],
    errors: [] as string[],
    rejections: [] as string[],
    listeners: [] as string[],
  }
  Object.defineProperty(window, '__e2e', { value: log, enumerable: false })
  const original = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest) {
    const onPage =
      this === window ||
      this === document ||
      this === document.documentElement ||
      (document.body !== null && this === document.body)
    // Only a listener added by the SDK's own code counts: the test tooling adds its own.
    if (log.armed && onPage && new Error().stack?.includes('/api/sdk/dist/'))
      log.listeners.push(type)
    return (original as (...args: unknown[]) => void).call(this, type, ...rest)
  } as typeof original
  original.call(document, 'securitypolicyviolation', (event: Event) =>
    log.violations.push(
      `${(event as SecurityPolicyViolationEvent).violatedDirective} ${(event as SecurityPolicyViolationEvent).blockedURI} in ${location.href}`,
    ),
  )
  original.call(window, 'error', (event: Event) =>
    log.errors.push((event as ErrorEvent).message || 'error'),
  )
  original.call(window, 'unhandledrejection', (event: Event) =>
    log.rejections.push(String((event as PromiseRejectionEvent).reason)),
  )
}

export type Recorded = {
  violations: string[]
  errors: string[]
  rejections: string[]
  listeners: string[]
}

/** What every frame of the page recorded, the top page first. */
export async function recorded(page: Page): Promise<Recorded[]> {
  const all: Recorded[] = []
  for (const frame of page.frames()) {
    try {
      all.push(
        await frame.evaluate(() => {
          const log = (window as unknown as { __e2e?: Recorded }).__e2e
          return log
            ? {
                violations: [...log.violations],
                errors: [...log.errors],
                rejections: [...log.rejections],
                listeners: [...log.listeners],
              }
            : { violations: [], errors: [], rejections: [], listeners: [] }
        }),
      )
    } catch {
      // A frame that is gone or has no document (a refused frame) has recorded nothing.
    }
  }
  return all
}

/**
 * The names of the properties of `window`, to compare before and after. A frame in the page is
 * also a property (`window[0]`), and an iframe is the one thing the SDK is meant to add.
 */
export const windowNames = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Object.getOwnPropertyNames(window)
      .filter((name) => !/^\d+$/.test(name))
      .sort(),
  )

/** Lets a task of the page run, so what an `await` in the SDK continues with has happened. */
export const settle = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())))
