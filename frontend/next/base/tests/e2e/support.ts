import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

// Next streams metadata, so right after a navigation the <title> may not be in yet; scanning then
// reports a false `document-title` violation.
export async function expectNoSeriousViolations(page: Page) {
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

export const isPhone = (project: string) => project === 'phone'
