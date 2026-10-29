import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

// Next streams metadata, so right after a navigation the <title> may not be in yet; scanning then
// reports a false `document-title` violation.
export async function expectNoSeriousViolations(page: Page) {
  // A redirect thrown inside Suspense is streamed as a 1 s meta refresh; scan the page it lands on.
  // One that never goes away still fails, by timeout.
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0)
  await expect(page).toHaveTitle(/\S/)
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
}

// A Radix trigger clicked before hydration opens nothing; retry the click until the first item
// shows (retries stay 0, so the wait is inside the test).
export async function openMenu(trigger: Locator, firstItem: Locator) {
  await expect(async () => {
    await trigger.click()
    await expect(firstItem).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
}

// A sheet slides in over 500 ms and a box read mid-slide is fractional (43.99998 px for a 44 px
// button). Wait for its finite animations, then measure; the thresholds stay exact.
export async function settled(locator: Locator) {
  await locator.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  )
}

// What a screen must satisfy whatever its content: no WCAG A/AA axe violation, no sideways scroll
// and exactly one visible h1. Returns one line per failure, naming the rule or the numbers, so a
// failing screen tells the agent what to fix; an empty list is a pass.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

// Next streams a redirect as a meta refresh and its title after the first paint, so this waits for both
// before scanning (React's version waits for networkidle instead); the checks themselves are the same.
export async function screenProblems(page: Page): Promise<string[]> {
  await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0)
  await expect(page).toHaveTitle(/\S/)
  const problems: string[] = []

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  for (const violation of results.violations) {
    const targets = violation.nodes.map((node) => node.target.join(' ')).join(' | ')
    problems.push(`axe ${violation.id} (${String(violation.impact)}): ${targets}`)
  }

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (scrollWidth > clientWidth) {
    problems.push(
      `horizontal overflow: scrollWidth ${String(scrollWidth)} > clientWidth ${String(clientWidth)}`,
    )
  }

  const headings = await page.getByRole('heading', { level: 1 }).count()
  if (headings !== 1) problems.push(`expected exactly one h1, found ${String(headings)}`)

  return problems
}

export const isPhone = (project: string) => project === 'phone'
