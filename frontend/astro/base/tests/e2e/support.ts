// support.ts belongs: the helpers the e2e specs share: the axe scan, the overflow and touch-target
// checks, the theme set before load, console and CSP collectors, and the per-screen checks.
// It does not belong: an assertion about one screen (the spec).
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test' // @nofrontends
import { expect, test as base, type Page } from '@playwright/test' // @frontends

// WCAG 2.0 and 2.1, levels A and AA, with no rule disabled and no element excluded. In dark this
// is also the contrast measurement.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

// One line per violation, naming the rule, its impact and the elements.
export async function axeProblems(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return results.violations.map((violation) => {
    const targets = violation.nodes.map((node) => node.target.join(' ')).join(' | ')
    return `axe ${violation.id} (${String(violation.impact)}): ${targets}`
  })
}

export async function expectNoAxeViolations(page: Page) {
  expect(await axeProblems(page)).toEqual([])
}

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

export async function expectNoHorizontalOverflow(page: Page) {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
}

// Every visible control (button, link, field) at least `minimum` px wide and tall. The skip link is
// clipped until it is focused, so it is outside this set. `count` is the number of controls the
// screen really has: a page that lost its controls must fail here, not pass on an empty set.
export async function expectTouchTargets(page: Page, minimum: number, count: number) {
  const sizes = await page
    .locator('button, a[href], input:not([type="hidden"]), select, textarea')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        if (!element.checkVisibility({ visibilityProperty: true })) return []
        if (element.closest('.skip-link') ?? element.classList.contains('skip-link')) return []
        const { width, height } = element.getBoundingClientRect()
        const name = element.getAttribute('aria-label') ?? element.textContent.trim()
        return [{ name: `${element.tagName.toLowerCase()} "${name}"`, width, height }]
      }),
    )
  expect(sizes.map((size) => size.name)).toHaveLength(count)
  const small = sizes.filter((size) => size.width < minimum || size.height < minimum)
  expect(small, `controls under ${String(minimum)} px`).toEqual([])
}

// Stores the theme choice the way public/theme-init.js reads it (the plain string), before any
// script of the page runs. A later call overrides an earlier one.
export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    localStorage.setItem('theme', value)
  }, theme)
}

// What every screen must satisfy whatever its content: no WCAG A/AA axe violation, no sideways
// scroll and exactly one h1. One line per failure, so a failing screen says what to fix; an empty
// list is a pass.
export async function screenProblems(page: Page): Promise<string[]> {
  await page.waitForLoadState('networkidle')
  await page
    .locator('h1')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 })
    .catch(() => undefined)
  const problems = await axeProblems(page)

  const overflow = await horizontalOverflow(page)
  if (overflow > 0) problems.push(`horizontal overflow: ${String(overflow)} px`)

  const headings = await page.getByRole('heading', { level: 1 }).count()
  if (headings !== 1) problems.push(`expected exactly one h1, found ${String(headings)}`)

  return problems
}

// Collects the console errors and warnings of a page (and its uncaught errors). Call before the
// first goto; read the list after. The browser logs "Failed to load resource" for a document it
// was answered with a 404: pass the paths that are expected to 404 and their line is left out.
export function collectConsoleProblems(
  page: Page,
  expectedMissing: readonly string[] = [],
): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    const type = message.type()
    if (type !== 'error' && type !== 'warning') return
    const path = new URL(message.location().url || 'http://x/').pathname
    if (expectedMissing.includes(path) && /status of 404/.test(message.text())) return
    problems.push(`${type}: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  return problems
}

// Records every securitypolicyviolation of the page (a blocked script, style or font), from the
// first byte of the document. Read the list with `cspViolations`.
export async function watchCspViolations(page: Page) {
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { cspViolations: violations })
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)
}
// @frontends-start

// The `test` of a spec beside several frontends. The browser opens `<dir>.localhost`, which
// Chromium resolves itself; Node cannot, so `request` goes to 127.0.0.1 and names the page's host
// in the host header, as the API maps hosts to frontends.
export const test = base.extend({
  request: async ({ playwright, baseURL }, use) => {
    const url = new URL(baseURL ?? 'http://127.0.0.1')
    const local = url.hostname.endsWith('.localhost')
    const context = await playwright.request.newContext(
      local
        ? { baseURL: `${url.protocol}//127.0.0.1:${url.port}`, extraHTTPHeaders: { host: url.host } }
        : { baseURL: url.href },
    )
    await use(context)
    await context.dispose()
  },
})
// @frontends-end
