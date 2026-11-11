import { expect, test } from '@playwright/test'

import { expectNoAxeViolations } from './support'

test('the index route is one h1 inside main and passes the axe scan', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveCount(1)

  await expectNoAxeViolations(page)
})

// @server-start
// The page's origin proxies /api to the server (the dev proxy, a static host or nginx): a request,
// not UI.
test('the API answers through the page origin', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
})
// @server-end
