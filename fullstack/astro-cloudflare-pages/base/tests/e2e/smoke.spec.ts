import { expect, test } from '@playwright/test'

import { expectNoAxeViolations } from './support'

test('the index route is one h1 inside main and passes the axe scan', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()

  await expectNoAxeViolations(page)
})

// One origin: the page, the 404 and the API all answer on the page's own origin.
test('the API answers on the page origin with a request id; a static page carries none', async ({
  request,
}) => {
  const health = await request.get('/api/health')
  expect(health.status()).toBe(200)
  expect(health.headers()['x-request-id']).toBeTruthy()
  expect(await health.json()).toMatchObject({ status: 'ok' })

  const page = await request.get('/')
  expect(page.status()).toBe(200)
  expect(page.headers()['content-type']).toContain('text/html')
  expect(page.headers()['x-request-id']).toBeUndefined()
})

test('an unknown /api path is the JSON 404 envelope, an unknown page the HTML 404', async ({
  request,
}) => {
  const api = await request.get('/api/nothing-here')
  expect(api.status()).toBe(404)
  expect(api.headers()['content-type']).toContain('application/json')
  expect(await api.json()).toMatchObject({ error: { code: 'not_found' } })

  const page = await request.get('/no/such/page')
  expect(page.status()).toBe(404)
  expect(page.headers()['content-type']).toContain('text/html')
  expect(await page.text()).toContain('Page not found')
})

// The reference module through `fetch` from the page's own context, under the page's CSP
// (connect-src 'self'). The data carries a name unique to this run and is removed afterwards.
test('the reference module creates and lists from the page context', async ({ page }) => {
  await page.goto('/')
  const name = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const result = await page.evaluate(async (moduleName) => {
    const created = await fetch('/api/module', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: moduleName }),
    })
    const item = (await created.json()) as { id: string; name: string }
    try {
      const listed = await fetch('/api/module?limit=100')
      const body = (await listed.json()) as { items: { id: string; name: string }[] }
      return {
        createdStatus: created.status,
        listedStatus: listed.status,
        found: body.items.some((entry) => entry.id === item.id && entry.name === moduleName),
      }
    } finally {
      await fetch(`/api/module/${item.id}`, { method: 'DELETE' })
    }
  }, name)

  expect(result).toEqual({ createdStatus: 201, listedStatus: 200, found: true })
})
