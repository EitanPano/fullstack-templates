import { expect, test } from '@playwright/test'

import { expectNoSeriousViolations } from './support'

test('the index route is one h1 inside main and passes the axe scan', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('__PROJECT_DISPLAY_NAME__')
  await expect(page.getByText('Replace this page with the first screen.')).toBeVisible()

  await expectNoSeriousViolations(page)
})
