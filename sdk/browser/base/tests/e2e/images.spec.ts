import { expect, test, type Page } from '@playwright/test'

import { LISTED_ORIGIN, OTHER_HTTPS_IMAGE_URL, OWN_IMAGE_URL, UNLISTED_IMAGE_URL } from './hosts'
import { apiFrame, fixtureBlock, loadSdk, mountUnit, recorded, recorder } from './support'

// An image in a unit goes through `createImage`, and the frame's policy lists where it may come
// from: its own origin and the server's `SDK_IMG_ORIGINS` (empty in this suite).
async function open(page: Page, props: Record<string, unknown>) {
  await page.addInitScript(recorder)
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await loadSdk(page)
  await mountUnit(page, { props: { text: 'Picture', ...props } })
  await expect(fixtureBlock(page)).toContainText('Picture')
}

const loaded = (page: Page, selector: string) =>
  apiFrame(page)!.evaluate((sel) => {
    const img = document.querySelector(sel) as HTMLImageElement | null
    return img ? img.complete && img.naturalWidth > 0 : null
  }, selector)

test.describe('images in a unit', () => {
  test('one from the API origin loads, with no policy violation and no referrer', async ({
    page,
    context,
  }) => {
    // The suite's API holds no picture: the browser's routing answers for it, after the policy
    // has judged the address.
    const png = Buffer.from(await (await fetch(`${LISTED_ORIGIN}/image.png`)).arrayBuffer())
    let referrer: string | undefined
    await context.route(OWN_IMAGE_URL, (route) => {
      referrer = route.request().headers()['referer']
      return route.fulfill({ status: 200, contentType: 'image/png', body: png })
    })
    await open(page, { image: OWN_IMAGE_URL })
    await expect.poll(() => loaded(page, '[data-fixture-image]')).toBe(true)
    const logs = await recorded(page)
    expect(logs.flatMap((log) => log.violations)).toEqual([])
    expect(referrer).toBeUndefined()
  })

  test('one from an https origin the policy does not list is refused by the policy', async ({
    page,
    context,
  }) => {
    // `createImage` accepts the address (https); the frame's policy is what refuses it. The
    // browser's routing would answer if the request were ever made.
    let requested = false
    await context.route(OTHER_HTTPS_IMAGE_URL, (route) => {
      requested = true
      return route.abort()
    })
    await open(page, { image: OTHER_HTTPS_IMAGE_URL })
    await expect(page.frameLocator('iframe').locator('[data-fixture-image]')).toHaveCount(1)
    await expect
      .poll(async () => (await recorded(page)).flatMap((log) => log.violations).length)
      .toBeGreaterThan(0)
    // An engine may report the refusal more than once; every report is this one.
    for (const violation of (await recorded(page)).flatMap((log) => log.violations)) {
      expect(violation).toMatch(/^img-src .*images.example.test/)
    }
    expect(await loaded(page, '[data-fixture-image]')).toBe(false)
    expect(requested).toBe(false)
  })

  test('one from the unlisted host is refused by the policy even when a module skips the helper', async ({
    page,
  }) => {
    await open(page, {})
    // A module that built the element itself would be refused by the lint; the policy is the
    // second line. The picture is a real one: it loads wherever the policy lets it.
    await apiFrame(page)!.evaluate((src) => {
      const img = document.createElement('img')
      img.setAttribute('data-planted', '')
      img.src = src
      document.body.appendChild(img)
    }, UNLISTED_IMAGE_URL)
    await expect
      .poll(async () => (await recorded(page)).flatMap((log) => log.violations))
      .toEqual([expect.stringMatching(/^img-src /)])
    expect(await loaded(page, '[data-planted]')).toBe(false)
  })

  test('the helper refuses an address that is neither https nor the frame’s own origin', async ({
    page,
  }) => {
    await open(page, { image: UNLISTED_IMAGE_URL })
    await expect(page.frameLocator('iframe').locator('[data-fixture-image]')).toHaveCount(0)
    expect((await recorded(page)).flatMap((log) => log.violations)).toEqual([])
  })
})
