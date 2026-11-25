import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import AxeBuilder from '@axe-core/playwright'
import type { BrowserContext, Locator, Page } from '@playwright/test'

import { API_LOG, GLOBAL, LOADER_URL, SDK_KEY, TELEMETRY_LINE } from './hosts'

/** What the host page is told: the kernel's own events and the fixture module's two. */
export type HostEvent = {
  name: string
  module?: string
  unit?: string
  code?: string
  reason?: string
  data?: unknown
}

export const EVENT_NAMES = [
  'rendered',
  'closed',
  'error',
  'fixture:viewed',
  'fixture:clicked',
  'fixture-modal:submitted',
]

type Handle = { id: string; update(props: object): void; close(): void }
type Hooked = { __sdkEvents?: HostEvent[]; __sdkUnits?: Record<string, Handle> }
type Sdk = {
  mount(module: string, target: Element | null, props?: object): Handle
  open(module: string, props?: object): Handle
  setConsent(state: string): void
  setTheme(theme: object): void
}

/**
 * Collects the events the host sees on a page that carries a tag: a queue the page holds before
 * the loader runs, so none is missed. A page with no tag uses `loadSdk`, which does the same.
 */
export async function watchEvents(page: Page): Promise<void> {
  await page.addInitScript(
    ({ global, names }) => {
      const win = window as unknown as Hooked & Record<string, unknown>
      win.__sdkEvents = []
      const collect = (event: unknown) => win.__sdkEvents?.push(event as HostEvent)
      win[global] = names.map((name) => ['on', name, collect])
    },
    { global: GLOBAL, names: EVENT_NAMES },
  )
}

/**
 * Starts the SDK on a page that carries no tag: the host's own script does what the tag would
 * (a queued call, then the script element). Events the host sees are collected on the page.
 * `consent`, `observe` and `theme` are `init` options.
 */
export async function loadSdk(
  page: Page,
  options: {
    consent?: 'granted' | 'denied'
    key?: string
    loader?: string
    observe?: boolean
    theme?: Record<string, string>
  } = {},
): Promise<void> {
  await page.evaluate(
    ({ consent, global, key, loader, names, observe, theme }) => {
      const win = window as unknown as Hooked & Record<string, unknown>
      win.__sdkEvents = []
      const collect = (event: unknown) => win.__sdkEvents?.push(event as HostEvent)
      const queue: unknown[][] = names.map((name) => ['on', name, collect])
      queue.push([
        'init',
        {
          key,
          ...(consent ? { consent } : {}),
          ...(observe ? { observe } : {}),
          ...(theme ? { theme } : {}),
        },
      ])
      win[global] = queue
      const script = document.createElement('script')
      script.async = true
      script.src = loader
      document.head.appendChild(script)
    },
    {
      consent: options.consent,
      global: GLOBAL,
      key: options.key ?? SDK_KEY,
      loader: options.loader ?? LOADER_URL,
      names: EVENT_NAMES,
      observe: options.observe,
      theme: options.theme,
    },
  )
}

export function hostEvents(page: Page): Promise<HostEvent[]> {
  return page.evaluate(() => (window as unknown as Hooked).__sdkEvents ?? [])
}

/** The names of the events the host has seen so far, in order. */
export async function eventNames(page: Page): Promise<string[]> {
  return (await hostEvents(page)).map((event) => event.name)
}

/**
 * Mounts a unit of the fixture module through the page's global, as a host script would, and
 * keeps its handle on the page. Resolves to the unit's id.
 */
export async function mountUnit(
  page: Page,
  options: { props?: Record<string, unknown>; target?: string; module?: string } = {},
): Promise<string> {
  // The loader is async: its global is the API once it has run.
  await page.waitForFunction(
    (name) =>
      typeof (window as unknown as Record<string, Partial<Sdk>>)[name]?.mount === 'function',
    GLOBAL,
  )
  return page.evaluate(
    ({ global, props, target, module }) => {
      const win = window as unknown as Hooked & Record<string, Sdk>
      const handle = win[global]!.mount(module, document.querySelector(target), props)
      const units = (win.__sdkUnits ??= {})
      units[handle.id] = handle
      return handle.id
    },
    {
      global: GLOBAL,
      props: options.props ?? {},
      target: options.target ?? '[data-place]',
      module: options.module ?? 'fixture',
    },
  )
}

/**
 * Opens a unit of a modal module through the page's global and keeps its handle on the page, as
 * `mountUnit` does. Resolves to the unit's id.
 */
export async function openUnit(
  page: Page,
  options: { props?: Record<string, unknown>; module?: string } = {},
): Promise<string> {
  await page.waitForFunction(
    (name) => typeof (window as unknown as Record<string, Partial<Sdk>>)[name]?.open === 'function',
    GLOBAL,
  )
  return page.evaluate(
    ({ global, props, module }) => {
      const win = window as unknown as Hooked & Record<string, Sdk>
      const handle = win[global]!.open(module, props)
      const units = (win.__sdkUnits ??= {})
      units[handle.id] = handle
      return handle.id
    },
    { global: GLOBAL, props: options.props, module: options.module ?? 'fixture-modal' },
  )
}

/** Calls `update` or `close` on a unit `mountUnit` kept. */
export function callUnit(
  page: Page,
  id: string,
  call: { update: object } | { close: true },
): Promise<void> {
  return page.evaluate(
    ({ id, call }) => {
      const unit = (window as unknown as Hooked).__sdkUnits?.[id]
      if ('update' in call) unit?.update(call.update)
      else unit?.close()
    },
    { id, call },
  )
}

/** A call of the page's global. */
export function callSdk(
  page: Page,
  call: { setConsent: string } | { setTheme: Record<string, string> },
): Promise<void> {
  return page.evaluate(
    ({ global, call }) => {
      const sdk = (window as unknown as Record<string, Sdk>)[global]!
      if ('setConsent' in call) sdk.setConsent(call.setConsent)
      else sdk.setTheme(call.setTheme)
    },
    { global: GLOBAL, call },
  )
}

/** The unit's frame: the iframe the kernel put on the page. */
export const unitFrame = (page: Page) => page.frameLocator('iframe')
export const fixtureBlock = (page: Page) => unitFrame(page).locator('[data-fixture-block]')

/** The frame document of the API, for what only a script in it can read. */
export const apiFrame = (page: Page) =>
  page.frames().find((frame) => frame.url().includes('/api/sdk/frame/'))

/** What a test needs of the engine: where the table of ADR 0020 F4 differs. */
export type Engine = 'chromium' | 'firefox' | 'webkit'

export type Recorded = {
  violations: string[]
  errors: string[]
  rejections: string[]
  listeners: string[]
  observers: string[]
}

/**
 * Records what a page does that the e2e asserts on, in every frame, before any script of the
 * page runs: policy violations, uncaught errors, unhandled rejections, and what the SDK's own code
 * adds to the page: listeners on `window` or the document, and mutation observers. It sits
 * behind a non-enumerable property that exists in both property snapshots a test compares.
 */
export function recorder(): void {
  const log: Recorded = {
    violations: [],
    errors: [],
    rejections: [],
    listeners: [],
    observers: [],
  }
  Object.defineProperty(window, '__e2e', { value: log, enumerable: false })
  // Only code of the SDK counts: the test tooling adds its own listeners and observers.
  const fromSdk = () => new Error().stack?.includes('/api/sdk/dist/') ?? false
  const original = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest) {
    const onPage =
      this === window ||
      this === document ||
      this === document.documentElement ||
      (document.body !== null && this === document.body)
    if (onPage && fromSdk()) log.listeners.push(type)
    return (original as (...args: unknown[]) => void).call(this, type, ...rest)
  } as typeof original
  const Mutation = window.MutationObserver
  window.MutationObserver = class extends Mutation {
    constructor(callback: MutationCallback) {
      super(callback)
      if (fromSdk()) log.observers.push('mutation')
    }
  }
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

/** What every frame of the page recorded, the top page first. */
export async function recorded(page: Page): Promise<Recorded[]> {
  const all: Recorded[] = []
  for (const frame of page.frames()) {
    try {
      const log = await frame.evaluate(() => {
        const found = (window as unknown as { __e2e?: Recorded }).__e2e
        return found
          ? {
              violations: [...found.violations],
              errors: [...found.errors],
              rejections: [...found.rejections],
              listeners: [...found.listeners],
              observers: [...found.observers],
            }
          : null
      })
      all.push(log ?? { violations: [], errors: [], rejections: [], listeners: [], observers: [] })
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

/** A dev runtime writes its output late: longer than a poll's default wait. */
export const LOG_WAIT = { timeout: 15_000 }

/**
 * A click that makes its unit close: the control is awaited, the click is not. The frame leaves
 * the page while the browser still waits for the click to be handled, and in Chromium the
 * protocol call then does not always answer; the close is what a test waits for.
 */
export async function clickToClose(target: Locator): Promise<void> {
  await target.waitFor()
  void target.click().catch(() => undefined)
}

/** How many lines of the API's output are the default telemetry sink's, for one event. */
export function telemetryLines(): number {
  if (!existsSync(API_LOG)) return 0
  return readFileSync(API_LOG, 'utf8')
    .split('\n')
    .filter((line) => TELEMETRY_LINE.test(line)).length
}

/** Lets a task of the page run, so what an `await` in the SDK continues with has happened. */
export const settle = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())))

/** Styles one of the page's elements through the CSSOM: the page's policy allows no style. */
export async function style(page: Page, selector: string, css: Record<string, string>) {
  await page.evaluate(
    ({ selector, css }) => {
      const element = document.querySelector(selector) as HTMLElement
      for (const [name, value] of Object.entries(css)) element.style.setProperty(name, value)
    },
    { selector, css },
  )
}

/**
 * The colour of one pixel of a PNG, as `[r, g, b, a]`. It decodes in a page of its own with no
 * policy, so the page under test is not touched.
 */
export async function pixelAt(
  context: BrowserContext,
  png: Buffer,
  x: number,
  y: number,
): Promise<number[]> {
  const page = await context.newPage()
  try {
    return await page.evaluate(
      async ({ data, x, y }) => {
        const blob = await (await fetch(`data:image/png;base64,${data}`)).blob()
        const bitmap = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(bitmap, 0, 0)
        return [...ctx.getImageData(x, y, 1, 1).data]
      },
      { data: png.toString('base64'), x, y },
    )
  } finally {
    await page.close()
  }
}

// What a screen must satisfy whatever its content: no WCAG A/AA axe violation inside the frame and
// no sideways scroll of the frame's document. The host page is not scanned: it is the integrator's.
// A unit owns no page heading, so there is no h1 rule. One line per failure, naming the rule or
// the numbers; an empty list is a pass.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

// An iframe in a modal's closed shadow root cannot be selected from the page: axe runs in the
// frame's own document there, from the engine's source, which the frame's policy never sees.
const AXE_SOURCE = () =>
  readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

type AxeFinding = { id: string; impact: string | null; targets: string[] }

async function axeInFrame(page: Page): Promise<AxeFinding[]> {
  const frame = apiFrame(page)
  if (!frame) return []
  await frame.evaluate(AXE_SOURCE())
  return frame.evaluate(async (tags) => {
    const run = (window as unknown as { axe: { run(...a: unknown[]): Promise<unknown> } }).axe
    const result = (await run.run(document, { runOnly: { type: 'tag', values: tags } })) as {
      violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }>
    }
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }))
  }, WCAG_TAGS)
}

export async function unitProblems(page: Page): Promise<string[]> {
  const problems: string[] = []
  const findings: AxeFinding[] =
    (await page.locator('iframe').count()) > 0
      ? (
          await new AxeBuilder({ page }).include('iframe').withTags(WCAG_TAGS).analyze()
        ).violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact ?? null,
          targets: violation.nodes.map((node) => node.target.join(' ')),
        }))
      : await axeInFrame(page)
  for (const finding of findings) {
    problems.push(`axe ${finding.id} (${String(finding.impact)}): ${finding.targets.join(' | ')}`)
  }
  const frame = apiFrame(page)
  if (!frame) return [...problems, 'no frame on the page']
  const { scrollWidth, clientWidth } = await frame.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (scrollWidth > clientWidth) {
    problems.push(
      `horizontal overflow: scrollWidth ${String(scrollWidth)} > clientWidth ${String(clientWidth)}`,
    )
  }
  return problems
}
