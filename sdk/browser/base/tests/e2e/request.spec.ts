import { expect, test, type Page } from '@playwright/test'

import { API_ORIGIN, CONFIG_URL, LISTED_ORIGIN, SDK_KEY } from './hosts'
import { loadSdk } from './support'

// The frame's own call (`request` of the frame context): what a module uses to reach an entity the
// server mounts for the frame alone. The fixture calls the path the page names on its element.
const block = (page: Page) =>
  page.frameLocator('[data-sdk-slot] iframe').locator('[data-fixture-block]')

async function open(page: Page, ask: string) {
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await page.evaluate(
    (path) => document.querySelector('[data-sdk-slot]')?.setAttribute('data-fixture-ask', path),
    ask,
  )
  await loadSdk(page)
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
    await open(page, '/api/sdk/v1/config')

    const request = await sent
    expect(request.method()).toBe('GET')
    expect(await request.headerValue('x-sdk-key')).toBe(SDK_KEY)
    expect((await request.response())?.status()).toBe(200)
    await expect(block(page)).toHaveAttribute('data-fixture-answer', '{"enabled":true}')
    expect(calls).toContain('GET /api/sdk/v1/config')
  })

  test('refuses a path outside the namespace before any request', async ({ page }) => {
    const calls = frameCalls(page)
    await open(page, '/api/health')

    await expect(block(page)).toHaveAttribute('data-fixture-answer', 'bad_path')
    expect(calls.filter((call) => call.endsWith(' /api/health'))).toEqual([])
  })

  test('refuses another origin before any request', async ({ page }) => {
    const elsewhere: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'elsewhere.example.test')
        elsewhere.push(request.url())
    })
    await open(page, '@elsewhere.example.test/api/sdk/v1/config')

    await expect(block(page)).toHaveAttribute('data-fixture-answer', 'bad_path')
    expect(elsewhere).toEqual([])
  })
})
