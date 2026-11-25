import { expect, test, type Page } from '@playwright/test'

import { FRAME_CSS_URL, LISTED_ORIGIN } from './hosts'
import {
  apiFrame,
  callSdk,
  fixtureBlock,
  loadSdk,
  mountUnit,
  pixelAt,
  recorded,
  recorder,
  style,
} from './support'

// The frame's stylesheet (`frame.css`): the SDK's base followed by each module's sheet, linked by
// the frame document under `style-src 'self'`. A rule can use a media query because the frame's
// width is the width the page gives the unit.
const fontSize = (page: Page) => fixtureBlock(page).evaluate((el) => getComputedStyle(el).fontSize)

async function open(
  page: Page,
  options: { theme?: Record<string, string>; props?: Record<string, unknown> } = {},
) {
  await page.addInitScript(recorder)
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await loadSdk(page, options.theme ? { theme: options.theme } : {})
  await mountUnit(page, { props: options.props ?? { text: 'Styled' } })
  await expect(fixtureBlock(page)).toBeVisible()
}

test.describe('the frame stylesheet', () => {
  test('is fetched as a stylesheet and applies, with no policy violation', async ({ page }) => {
    const sheet = page.waitForResponse(FRAME_CSS_URL)
    await open(page)
    const response = await sheet
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('text/css; charset=utf-8')
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
    // Rules of the module's sheet and of the base are in force.
    const computed = await fixtureBlock(page).evaluate((el) => {
      const block = getComputedStyle(el)
      const body = getComputedStyle(document.body)
      return { padding: block.paddingTop, height: block.height, margin: body.margin }
    })
    expect(computed).toEqual({ padding: '8px', height: '120px', margin: '0px' })
    const logs = await recorded(page)
    expect(logs.flatMap((log) => log.violations)).toEqual([])
    expect(logs.flatMap((log) => log.errors)).toEqual([])
  })

  test("a rule of the sheet changes when the slot's width crosses its breakpoint", async ({
    page,
  }) => {
    await open(page)
    await style(page, '[data-place]', { width: '700px' })
    await expect.poll(() => fontSize(page)).toBe('16px')
    await style(page, '[data-place]', { width: '300px' })
    await expect.poll(() => fontSize(page)).toBe('12px')
    await style(page, '[data-place]', { width: '700px' })
    await expect.poll(() => fontSize(page)).toBe('16px')
  })

  test("the theme's tokens win over the sheet's defaults", async ({ page }) => {
    await open(page, {
      props: { text: 'Themed', href: 'https://example.test/page' },
      theme: { text: '#123456', accent: '#0a7a3c', radius: '8px', scheme: 'light' },
    })
    const colours = await apiFrame(page)!.evaluate(() => {
      const block = document.querySelector('[data-fixture-block]') as HTMLElement
      const link = block.querySelector('a') as HTMLElement
      return {
        text: getComputedStyle(block).color,
        link: getComputedStyle(link).color,
        muted: getComputedStyle(document.documentElement).getPropertyValue('--sdk-muted').trim(),
      }
    })
    expect(colours.text).toBe('rgb(18, 52, 86)')
    expect(colours.link).toBe('rgb(10, 122, 60)')
    // A token the theme leaves alone keeps the sheet's default.
    expect(colours.muted).toContain('light-dark(')
  })

  test('a dark scheme set after the first paint reaches the frame and its iframe', async ({
    page,
  }) => {
    await open(page)
    await callSdk(page, { setTheme: { scheme: 'dark' } })
    await expect
      .poll(() =>
        apiFrame(page)!.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      )
      .toBe('dark')
    expect(await page.locator('iframe').evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
      'dark',
    )
  })

  test('a dark frame on a light page is transparent: the page shows through', async ({
    page,
    context,
  }) => {
    await open(page, { theme: { scheme: 'dark' } })
    const iframe = page.locator('iframe')
    await expect(iframe).toHaveCSS('color-scheme', 'dark')
    expect(
      await apiFrame(page)!.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ).toBe('rgba(0, 0, 0, 0)')
    // The proof is in the pixels: the lower right of the frame, where it draws nothing, is the
    // page's white. An opaque dark frame would show black or the dark surface there.
    const shot = await iframe.screenshot()
    const box = (await iframe.boundingBox())!
    const [r, g, b] = await pixelAt(
      context,
      shot,
      Math.floor(box.width) - 2,
      Math.floor(box.height) - 2,
    )
    expect([r, g, b]).toEqual([255, 255, 255])
  })
})
