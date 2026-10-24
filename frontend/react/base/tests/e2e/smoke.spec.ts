import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
}

test('home page reaches the API and has no serious accessibility violations', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('API v')

  expect(await seriousViolations(page)).toEqual([])
})

test('an unknown path renders the not-found page, not a server error', async ({ page }) => {
  await page.goto('/no/such/page')

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

  expect(await seriousViolations(page)).toEqual([])
})
