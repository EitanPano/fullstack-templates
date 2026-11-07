import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

import { STORAGE_KEYS } from '../../src/app/core/config/constants'

// WCAG 2.0 and 2.1, levels A and AA, with no rule disabled and no element excluded. In dark this
// is also the contrast measurement.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

export const isPhone = (project: string) => project === 'phone'

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
// clipped until it is focused, so it is outside this set. Run it with the drawer open to cover the
// navigation links, which are hidden while it is closed.
export async function expectTouchTargets(page: Page, minimum = 44) {
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
  expect(sizes.length).toBeGreaterThan(0)
  const small = sizes.filter((size) => size.width < minimum || size.height < minimum)
  expect(small, `controls under ${String(minimum)} px`).toEqual([])
}

// Stores the theme choice the way ThemeService writes it and public/theme-init.js reads it (the
// value JSON-encoded), before any script of the page runs. A later call overrides an earlier one.
export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    [STORAGE_KEYS.theme, theme] as const,
  )
}

// An address no earlier run used, so a run never depends on what another left in the database and
// parallel journeys never share an account. `run` names the journey in the address.
export function uniqueEmail(run: string): string {
  const label = run
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 24)
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `e2e-${label}-${unique}@example.com`
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
