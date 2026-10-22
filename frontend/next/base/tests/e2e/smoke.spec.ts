import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('home page reaches the API and has no serious accessibility violations', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('API v')

  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
})
