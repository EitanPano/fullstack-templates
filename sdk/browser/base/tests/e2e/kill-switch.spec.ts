import { expect, test, type Page, type Route } from '@playwright/test'

import { CONFIG_URL, LISTED_ORIGIN, TELEMETRY_URL } from './hosts'
import { hostEvents, loadSdk, settle } from './support'

// V10: a kill switch, a failed read and a slow read each leave the page as it was, and nothing
// is sent as telemetry before consent.
const body = (page: Page) => page.locator('body').innerHTML()

async function untouched(page: Page, before: string) {
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(await body(page)).toBe(before)
}

// The real server answers, so its CORS headers are the ones the browser checks; only the body
// changes.
async function answerWith(route: Route, json: unknown) {
  const response = await route.fetch()
  await route.fulfill({ response, json })
}

test.describe('the kill switch', () => {
  test('`enabled: false` creates no frame and changes nothing', async ({ page }) => {
    await page.route(CONFIG_URL, (route) => answerWith(route, { enabled: false }))
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    const before = await body(page)
    const answered = page.waitForResponse(CONFIG_URL)
    await loadSdk(page)
    await answered
    await settle(page)
    await settle(page)
    await untouched(page, before)
    expect(await hostEvents(page)).toEqual([])
  })

  test('a failed read creates no frame, changes nothing and reports one error', async ({
    page,
  }) => {
    await page.route(CONFIG_URL, (route) => route.abort('failed'))
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    const before = await body(page)
    await loadSdk(page)
    await expect
      .poll(async () => (await hostEvents(page)).map((event) => event.name))
      .toEqual(['error'])
    await untouched(page, before)
  })

  test('a slow read creates no frame, changes nothing and reports a timeout', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(CONFIG_URL, async (route) => {
      await gate
      await route.continue().catch(() => undefined)
    })
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    const before = await body(page)
    await loadSdk(page)
    await expect
      .poll(async () => hostEvents(page), { timeout: 10_000 })
      .toEqual([{ name: 'error', message: 'timeout' }])
    release()
    await settle(page)
    await untouched(page, before)
  })
})

// The frame tracks `rendered` once the host's text arrives, which is after the consent state.
test.describe('consent', () => {
  async function telemetry(page: Page) {
    const sent: { headers: Record<string, string>; body: unknown }[] = []
    await page.route(TELEMETRY_URL, async (route) => {
      const request = route.request()
      sent.push({ headers: request.headers(), body: request.postDataJSON() })
      await route.fulfill({ status: 204 })
    })
    return sent
  }
  const frameOf = (page: Page) =>
    page.frames().find((frame) => frame.url().includes('/api/sdk/frame/'))

  async function flush(page: Page) {
    // What the frame listens to when the page is left: the buffer drains once.
    await frameOf(page)?.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  }

  test('nothing is sent before consent', async ({ page }) => {
    const sent = await telemetry(page)
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await expect(page.locator('iframe')).toHaveCSS('height', '120px')
    await flush(page)
    await settle(page)
    expect(sent).toEqual([])
  })

  test('one request after consent, with the key and without a cookie', async ({ page }) => {
    const sent = await telemetry(page)
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page, { consent: 'granted' })
    await expect(page.locator('iframe')).toHaveCSS('height', '120px')
    await flush(page)
    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]?.body).toEqual({ events: [{ name: 'rendered' }] })
    expect(sent[0]?.headers['x-sdk-key']).toBe('pk_e2e_listed')
    expect(sent[0]?.headers['cookie']).toBeUndefined()
    await flush(page)
    await settle(page)
    expect(sent).toHaveLength(1)
  })

  test('what was tracked before consent is dropped, not sent late', async ({ page }) => {
    const sent = await telemetry(page)
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await expect(page.locator('iframe')).toHaveCSS('height', '120px')
    await page.evaluate(() =>
      (window as unknown as Record<string, { setConsent(s: string): void }>)[
        '__SDK_GLOBAL__'
      ]?.setConsent('granted'),
    )
    await flush(page)
    await settle(page)
    expect(sent).toEqual([])
  })

  test('the frame is let through its own origin by the server gate', async ({ page }) => {
    // No interception: the frame posts from the API's own origin, with an Origin header, and the
    // server has no telemetry endpoint. A 404 means the gate let it pass; a 403 would not.
    const status = page.waitForResponse((response) => response.url() === TELEMETRY_URL)
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page, { consent: 'granted' })
    await expect(page.locator('iframe')).toHaveCSS('height', '120px')
    await flush(page)
    expect((await status).status()).toBe(404)
  })
})
