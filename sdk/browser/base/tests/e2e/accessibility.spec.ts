import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { LISTED_ORIGIN } from './hosts'
import { loadSdk } from './support'

// The frame draws on someone else's page, so what it draws must pass the same scan a frontend's
// screens do: no serious or critical axe violation in the host page or in the frame. A module's
// own spec scans its frame the same way once it draws something.
test('a page with the drawn frame has no serious accessibility violation', async ({ page }) => {
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await loadSdk(page)
  await expect(
    page.frameLocator('[data-sdk-slot] iframe').locator('[data-fixture-block]'),
  ).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(', ')}`)

  expect(serious).toEqual([])
})
