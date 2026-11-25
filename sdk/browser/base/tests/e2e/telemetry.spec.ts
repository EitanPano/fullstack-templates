import { expect, test, type Page } from '@playwright/test'

import { GLOBAL, LISTED_ORIGIN, SDK_KEY, TELEMETRY_URL } from './hosts'
import {
  apiFrame,
  callSdk,
  callUnit,
  fixtureBlock,
  loadSdk,
  LOG_WAIT,
  mountUnit,
  settle,
  telemetryLines,
} from './support'

// Telemetry is the frame's alone. The host page makes no request of its own to it, nothing is
// sent before the host grants consent, and the frame sends what it buffered when it is left.
type Sent = {
  body: unknown
  headers: Record<string, string>
  /** The server's answer, read where the browser's own page cannot lose it. */
  status: number
  fromTopPage: boolean
}

/**
 * Every POST to the telemetry endpoint, from any frame. The browser's routing forwards each to the
 * real server and keeps what the server answered: a frame that was removed (a closed unit) leaves
 * no page-level event behind in some engines, and the keepalive request of its `pagehide` is
 * exactly what one test is about.
 */
async function watchTelemetry(page: Page): Promise<Sent[]> {
  const sent: Sent[] = []
  await page.route(TELEMETRY_URL, async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    const response = await route.fetch()
    sent.push({
      body: request.postDataJSON() as unknown,
      headers: request.headers(),
      status: response.status(),
      fromTopPage: request.frame() === page.mainFrame(),
    })
    return route.fulfill({ response })
  })
  return sent
}

/** What the frame listens to when its page is left: the buffer drains once. */
const leave = (page: Page) =>
  apiFrame(page)?.evaluate(() => window.dispatchEvent(new Event('pagehide')))

async function open(page: Page, consent?: 'granted') {
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await loadSdk(page, consent ? { consent } : {})
  const id = await mountUnit(page, { props: { text: 'x' } })
  await expect(fixtureBlock(page)).toBeVisible()
  return id
}

test.describe('telemetry', () => {
  test('nothing is sent before consent', async ({ page }) => {
    const sent = await watchTelemetry(page)
    await open(page)
    await leave(page)
    await settle(page)
    expect(sent).toEqual([])
  })

  test('after consent a tracked item arrives with the key and no cookie, and is answered 204', async ({
    page,
  }) => {
    const sent = await watchTelemetry(page)
    await open(page, 'granted')
    await leave(page)
    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]?.status).toBe(204)
    expect(sent[0]?.body).toEqual({ events: [{ name: 'rendered' }] })
    expect(sent[0]?.headers['x-sdk-key']).toBe(SDK_KEY)
    expect(sent[0]?.headers['cookie']).toBeUndefined()
    // The buffer drained: leaving again sends nothing.
    await leave(page)
    await settle(page)
    expect(sent).toHaveLength(1)
  })

  test('closing a unit sends what the frame had buffered', async ({ page, browserName }) => {
    const sent = await watchTelemetry(page)
    const id = await open(page, 'granted')
    const before = telemetryLines()
    await callUnit(page, id, { close: true })
    await expect(page.locator('iframe')).toHaveCount(0)
    // In every engine the server's own output shows the batch arriving, which no route sees in
    // Chromium and Firefox: Playwright reports no request for a frame removed in the same task.
    await expect.poll(telemetryLines, LOG_WAIT).toBeGreaterThan(before)
    if (browserName !== 'webkit') {
      expect(sent).toEqual([])
      return
    }
    // The frame is gone, so what arrives is what its `pagehide` handler sent.
    await expect.poll(() => sent.length).toBe(1)
    expect(sent.map((one) => one.status)).toEqual([204])
    expect(sent.map((one) => one.body)).toEqual([{ events: [{ name: 'rendered' }] }])
  })

  test('a unit told denied and closed in one task sends nothing', async ({ page }) => {
    const sent = await watchTelemetry(page)
    const id = await open(page, 'granted')
    await page.evaluate(
      ({ global, id }) => {
        const win = window as unknown as {
          __sdkUnits: Record<string, { close(): void }>
        } & Record<string, { setConsent(state: string): void }>
        win[global]!.setConsent('denied')
        win.__sdkUnits[id]!.close()
      },
      { global: GLOBAL, id },
    )
    await expect(page.locator('iframe')).toHaveCount(0)
    await settle(page)
    // Give the frame's page hide time to send what it should not.
    await page.waitForTimeout(500)
    // Not the server's output: other specs send telemetry at the same time. WebKit is the engine
    // that shows a frame's last request here, as in the row above.
    expect(sent).toEqual([])
  })

  test('what was tracked before consent is dropped, not sent late', async ({ page }) => {
    const sent = await watchTelemetry(page)
    await open(page)
    await callSdk(page, { setConsent: 'granted' })
    await leave(page)
    await settle(page)
    expect(sent).toEqual([])
  })

  test('the host page makes no telemetry request of its own', async ({ page }) => {
    const sent = await watchTelemetry(page)
    await open(page, 'granted')
    await leave(page)
    await expect.poll(() => sent.length).toBe(1)
    expect(sent.filter((one) => one.fromTopPage)).toEqual([])
  })

  // What the page's own request meets differs by engine, as the table says: the server answers 403
  // to a request that reaches it, and a browser may hide the answer or never send the request.
  test('the host page cannot call the endpoint: its preflighted request is never sent', async ({
    page,
  }) => {
    const responses: number[] = []
    page.on('response', (response) => {
      if (response.url() === TELEMETRY_URL) responses.push(response.status())
    })
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    const outcome = await page.evaluate(
      ({ url, key }) =>
        fetch(url, {
          method: 'POST',
          headers: { 'x-sdk-key': key, 'content-type': 'application/json' },
          body: JSON.stringify({ events: [{ name: 'from-the-page' }] }),
        }).then(
          (response) => `answered ${String(response.status)}`,
          () => 'rejected',
        ),
      { url: TELEMETRY_URL, key: SDK_KEY },
    )
    // The server gives the page no leave to send the key header there: no answer reaches it.
    expect(outcome).toBe('rejected')
    expect(responses).toEqual([])
  })

  test('the host page cannot call the endpoint: a simple request is answered 403', async ({
    page,
    browserName,
  }) => {
    const responses: number[] = []
    page.on('response', (response) => {
      if (response.url() === TELEMETRY_URL) responses.push(response.status())
    })
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    const outcome = await page.evaluate(
      (url) =>
        fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'content-type': 'text/plain' },
          body: JSON.stringify({ events: [{ name: 'from-the-page' }] }),
        }).then(
          () => 'resolved',
          () => 'rejected',
        ),
      TELEMETRY_URL,
    )
    // Nothing the endpoint answers with success is ever seen by the network.
    expect(responses.filter((status) => status !== 403)).toEqual([])
    // Firefox shows the server's 403. Chromium and WebKit block the response of an error from
    // another origin (Cross-Origin-Resource-Policy), so the page's request fails there and the
    // network layer reports no answer.
    if (browserName === 'firefox') expect(responses).toEqual([403])
    else expect(responses).toEqual([])
    expect(outcome).toBe('rejected')
  })
})
