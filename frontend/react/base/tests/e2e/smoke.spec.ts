import { expect, test } from '@playwright/test'

import { expectNoSeriousViolations } from './support'

test('the index route is one h1 inside main and passes the axe scan', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveCount(1)

  await expectNoSeriousViolations(page)
})

// The proxy proof: the page's own origin forwards /api to the server, in dev, preview and the
// containers. A request, not UI: the template has no screen that calls the API.
test('the API answers through the page origin', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
})
