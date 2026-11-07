import { expect, test, type Page } from '@playwright/test'

import { expectNoAxeViolations } from './support'

const fact = (page: Page, label: string) =>
  page.locator('.health-status__fact', { hasText: label }).locator('dd')

test('the home screen reaches the API and shows its status', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'System status' })).toBeVisible()
  await expect(fact(page, 'Status')).toHaveText('Operational')
  await expect(fact(page, 'Version')).toHaveText(/\S/)

  await expectNoAxeViolations(page)
})

test('Refresh asks the API again and keeps the status on screen', async ({ page }) => {
  await page.goto('/')
  await expect(fact(page, 'Status')).toHaveText('Operational')

  const answered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/health' && response.ok(),
  )
  await page.getByRole('button', { name: 'Refresh' }).click()
  await answered

  await expect(fact(page, 'Status')).toHaveText('Operational')
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  await expectNoAxeViolations(page)
})
