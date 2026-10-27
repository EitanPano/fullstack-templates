import { expect, test } from '@playwright/test'

import { expectNoSeriousViolations } from './support'

test('home page reaches the API and shows its status', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('API v')

  await expectNoSeriousViolations(page)
})

test('Refresh pings the API again and confirms with a toast', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('API v')

  await page.getByRole('button', { name: 'Refresh' }).click()

  await expect(page.getByText('Status refreshed')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'API v' })).toBeVisible()

  await expectNoSeriousViolations(page)
})
