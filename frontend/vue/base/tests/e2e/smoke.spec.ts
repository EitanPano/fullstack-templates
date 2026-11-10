import { expect, test } from '@playwright/test'

import { expectNoAxeViolations } from './support'

test('the index route is one h1 inside main and passes the axe scan', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
    '__PROJECT_DISPLAY_NAME__',
  )
  await expect(page.getByText('Replace this page with the first screen.')).toBeVisible()

  await expectNoAxeViolations(page)
})

// The page's origin forwards /api to the server (the dev and preview proxy, nginx, or the server
// itself): a request through it, not a screen, proves the proxy.
test('the API answers on the page origin', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
})
