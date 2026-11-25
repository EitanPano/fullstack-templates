import { expect, test, type Page, type Route } from '@playwright/test'

import { CONFIG_URL, LISTED_ORIGIN } from './hosts'
import { hostEvents, loadSdk, mountUnit, settle, watchEvents } from './support'

// V10: a kill switch, a failed read and a slow read each leave the page as it was. A `mount` made
// while the read is open waits, and reports `closed` with `disabled` when the answer is no.
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

const disabled = { name: 'closed', module: 'fixture', unit: 'u1', reason: 'disabled' }

test.describe('the kill switch', () => {
  test('`enabled: false` creates no frame, changes nothing and closes a waiting mount', async ({
    page,
  }) => {
    await page.route(CONFIG_URL, (route) => answerWith(route, { enabled: false }))
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    const before = await body(page)
    const answered = page.waitForResponse(CONFIG_URL)
    await loadSdk(page)
    // Made before the answer: the unit waits for it.
    await mountUnit(page, { props: { text: 'x' } })
    await answered
    await expect.poll(() => hostEvents(page)).toEqual([disabled])
    await untouched(page, before)
    // A mount after the answer is closed at once.
    await mountUnit(page)
    await expect.poll(() => hostEvents(page)).toEqual([disabled, { ...disabled, unit: 'u2' }])
    await untouched(page, before)
  })

  test('`enabled: false` leaves a page with a slot as it was, and says nothing', async ({
    page,
  }) => {
    await page.route(CONFIG_URL, (route) => answerWith(route, { enabled: false }))
    await watchEvents(page)
    const answered = page.waitForResponse(CONFIG_URL)
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    const before = await body(page)
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
    await mountUnit(page)
    await expect
      .poll(() => hostEvents(page))
      .toEqual([{ name: 'error', code: 'config_failed' }, disabled])
    await untouched(page, before)
  })

  test('a slow read creates no frame, changes nothing and reports a failed read', async ({
    page,
  }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(CONFIG_URL, async (route) => {
      await gate
      await route.continue().catch(() => undefined)
    })
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    const before = await body(page)
    await loadSdk(page)
    await mountUnit(page)
    await expect
      .poll(() => hostEvents(page), { timeout: 15_000 })
      .toEqual([{ name: 'error', code: 'config_failed' }, disabled])
    release()
    await settle(page)
    await untouched(page, before)
  })
})
