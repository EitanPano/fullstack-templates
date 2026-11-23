import { expect, test } from '@playwright/test' // @nofrontends
import { expect } from '@playwright/test' // @frontends

import { NOT_FOUND } from './screen-routes'
import { expectNoAxeViolations } from './support' // @nofrontends
import { expectNoAxeViolations, test } from './support' // @frontends

test('the index route is one h1 inside main and passes the axe scan', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()

  await expectNoAxeViolations(page)
})

test('the index page is HTML with a 200 and an unknown page is the 404 page with a 404', async ({
  request,
}) => {
  const index = await request.get('/')
  expect(index.status()).toBe(200)
  expect(index.headers()['content-type']).toContain('text/html')

  const missing = await request.get(NOT_FOUND)
  expect(missing.status()).toBe(404)
  expect(missing.headers()['content-type']).toContain('text/html')
  expect(await missing.text()).toContain('Page not found')
})

// @server-start
// One origin: the page, the 404 and the API all answer on the page's own origin.
test('the API answers on the page origin with a request id; a static page carries none', async ({
  request,
}) => {
  const health = await request.get('/api/health')
  expect(health.status()).toBe(200)
  expect(health.headers()['x-request-id']).toBeTruthy()
  expect(await health.json()).toMatchObject({ status: 'ok' })

  const page = await request.get('/')
  expect(page.headers()['x-request-id']).toBeUndefined()
})

test('an unknown /api path is the JSON 404 envelope', async ({ request }) => {
  const api = await request.get('/api/nothing-here')
  expect(api.status()).toBe(404)
  expect(api.headers()['content-type']).toContain('application/json')
  expect(await api.json()).toMatchObject({ error: { code: 'not_found' } })
})

// The reference entity through `fetch` from the page's own context, under the page's policy
// (connect-src 'self'). The data carries a name unique to this run and is removed afterwards.
test('the reference entity creates and lists from the page context', async ({ page }) => {
  await page.goto('/')
  const name = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const result = await page.evaluate(async (entityName) => {
    const created = await fetch('/api/entity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: entityName }),
    })
    const item = (await created.json()) as { id: string; name: string }
    try {
      const listed = await fetch('/api/entity?limit=100')
      const body = (await listed.json()) as { items: { id: string; name: string }[] }
      return {
        createdStatus: created.status,
        listedStatus: listed.status,
        found: body.items.some((entry) => entry.id === item.id && entry.name === entityName),
      }
    } finally {
      await fetch(`/api/entity/${item.id}`, { method: 'DELETE' })
    }
  }, name)

  expect(result).toEqual({ createdStatus: 201, listedStatus: 200, found: true })
})
// @server-end
