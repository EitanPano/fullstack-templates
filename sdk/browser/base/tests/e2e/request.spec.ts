import { expect, test, type Page } from '@playwright/test'

import { API_ORIGIN, CONFIG_URL, LISTED_ORIGIN, SDK_KEY } from './hosts'
import { fixtureBlock, loadSdk, mountUnit } from './support'

// The frame's own call (`request` of the frame context): what a module uses to reach an entity the
// server mounts for the frame alone. The fixture holds its paths and the props pick one by name.
async function open(page: Page, props: Record<string, unknown>) {
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await loadSdk(page)
  await mountUnit(page, { props })
}

/** Every request a frame of the API's origin made to the API, as `METHOD path`. */
function frameCalls(page: Page): string[] {
  const calls: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    const from = request.frame()
    if (from === page.mainFrame() || url.origin !== API_ORIGIN || request.isNavigationRequest())
      return
    if (url.pathname.startsWith('/api/sdk/dist/')) return
    calls.push(`${request.method()} ${url.pathname}`)
  })
  return calls
}

test.describe("the frame's own call", () => {
  test('reaches the namespace on its own origin with the key, and gets the answer', async ({
    page,
  }) => {
    const calls = frameCalls(page)
    const sent = page.waitForRequest(
      (request) => request.url() === CONFIG_URL && request.frame() !== page.mainFrame(),
    )
    await open(page, { call: 'config' })

    const request = await sent
    expect(request.method()).toBe('GET')
    expect(await request.headerValue('x-sdk-key')).toBe(SDK_KEY)
    expect((await request.response())?.status()).toBe(200)
    await expect(fixtureBlock(page)).toHaveAttribute('data-fixture-answer', '{"enabled":true}')
    expect(calls).toContain('GET /api/sdk/v1/config')
  })

  test('refuses a path outside the namespace before any request', async ({ page }) => {
    const calls = frameCalls(page)
    await open(page, { call: 'outside' })

    await expect(fixtureBlock(page)).toHaveAttribute('data-fixture-answer', 'bad_path')
    expect(calls.filter((call) => call.endsWith(' /api/health'))).toEqual([])
  })

  test('refuses another origin before any request', async ({ page }) => {
    const elsewhere: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'elsewhere.example.test')
        elsewhere.push(request.url())
    })
    await open(page, { call: 'elsewhere' })

    await expect(fixtureBlock(page)).toHaveAttribute('data-fixture-answer', 'bad_path')
    expect(elsewhere).toEqual([])
  })

  test('never takes a path from a prop: the page cannot make the frame call an endpoint', async ({
    page,
  }) => {
    const calls = frameCalls(page)
    await open(page, { call: '/api/sdk/v1/config', ask: '/api/sdk/v1/config' })

    await expect(fixtureBlock(page)).toBeVisible()
    await page.waitForTimeout(300)
    await expect(fixtureBlock(page)).not.toHaveAttribute('data-fixture-answer', /.*/)
    expect(calls.filter((call) => call.endsWith('/config'))).toEqual([])
  })
})
