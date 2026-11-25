import { expect, test, type Page } from '@playwright/test'

import { API_ORIGIN, GLOBAL, LISTED_ORIGIN, SDK_KEY, SLOT, UNLISTED_ORIGIN } from './hosts'
import {
  apiFrame,
  eventNames,
  hostEvents,
  loadSdk,
  mountUnit,
  unitFrame,
  watchEvents,
} from './support'

// V15, first half: who may frame the unit, and what the page can reach of it.
test.describe('a frame only where it may be', () => {
  test('an unlisted origin gets a blank frame, then nothing: closed with timeout, no other event', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    // The nested page is on the listed origin, so its read of the config passes and its slot is
    // mounted; the frame is refused because its other ancestor, the page above, is not listed.
    // The queue puts the host's collectors in place before the loader runs, in the nested page.
    await page.addInitScript(
      ({ listed, global }) => {
        if (location.origin !== listed) return
        const events: unknown[] = []
        const win = window as unknown as Record<string, unknown>
        win['__sdkEvents'] = events
        win[global] = ['rendered', 'closed', 'error'].map((name) => [
          'on',
          name,
          (event: unknown) => events.push(event),
        ])
      },
      { listed: LISTED_ORIGIN, global: GLOBAL },
    )
    await page.goto(`${UNLISTED_ORIGIN}/nested.html`)
    const nested = () => page.frames().find((frame) => frame.url().endsWith('/guest.html'))
    await expect.poll(() => nested() !== undefined).toBe(true)
    // The refused frame is blank in every engine: its document is an error page (Chromium), an
    // empty one (Firefox, which also reports no address at times) or holds nothing of the unit
    // (WebKit keeps its address). It is looked at while the kernel still waits for the handshake.
    await expect(nested()!.locator(`[${SLOT}] iframe`)).toHaveCount(1)
    const refused = page.frames().filter((frame) => frame.parentFrame() === nested())
    expect(refused).toHaveLength(1)
    const url = refused[0]!.url()
    if (url.startsWith(API_ORIGIN)) {
      expect(await refused[0]!.locator('[data-fixture-block]').count()).toBe(0)
    } else {
      expect(['', 'about:blank', 'chrome-error://chromewebdata/']).toContain(url)
    }
    // Then the handshake times out: the unit reports it and leaves nothing on the page.
    await expect
      .poll(
        () =>
          nested()!.evaluate(() => (window as unknown as { __sdkEvents: unknown[] }).__sdkEvents),
        {
          timeout: 15_000,
        },
      )
      .toEqual([{ name: 'closed', module: 'fixture', unit: 'u1', reason: 'timeout' }])
    await expect(nested()!.locator('iframe')).toHaveCount(0)
    expect(
      await nested()!
        .locator(`[${SLOT}]`)
        .evaluate((el) => el.childElementCount),
    ).toBe(0)
    expect(pageErrors).toEqual([])
  })

  test('a page of an unlisted origin is refused the config: no frame, an error and a closed unit', async ({
    page,
  }) => {
    await page.goto(`${UNLISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await mountUnit(page)
    await expect
      .poll(() => hostEvents(page))
      .toEqual([
        { name: 'error', code: 'config_failed' },
        { name: 'closed', module: 'fixture', unit: 'u1', reason: 'disabled' },
      ])
    await expect(page.locator('iframe')).toHaveCount(0)
  })

  test('the page reads nothing of the frame', async ({ page }) => {
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    const iframe = page.locator(`[${SLOT}] iframe`)
    await expect(iframe).toHaveCSS('height', '120px')
    const reads = await page.evaluate(() => {
      const element = document.querySelector('iframe') as HTMLIFrameElement
      const attempt = (fn: () => unknown) => {
        try {
          return `read: ${String(fn())}`
        } catch (error) {
          return `threw: ${(error as Error).name}`
        }
      }
      return {
        contentDocument: element.contentDocument,
        windowDocument: attempt(() => element.contentWindow?.document),
        location: attempt(() => element.contentWindow?.location.href),
        byIndex: attempt(() => (window.frames[0] as Window).document.title),
        inPage: document.querySelector('[data-fixture-block]'),
      }
    })
    expect(reads.contentDocument).toBeNull()
    expect(reads.windowDocument).toBe('threw: SecurityError')
    expect(reads.location).toBe('threw: SecurityError')
    expect(reads.byIndex).toBe('threw: SecurityError')
    expect(reads.inPage).toBeNull()
    const src = new URL((await iframe.getAttribute('src')) as string)
    expect(src.origin).toBe(API_ORIGIN)
    expect(src.searchParams.get('k')).toBe(SDK_KEY)
    expect(src.searchParams.get('m')).toBe('fixture')
  })

  const link = (page: Page) => unitFrame(page).getByRole('link', { name: 'Learn more' })

  test('a moved frame reloads and shakes hands again, and reports rendered once', async ({
    page,
  }) => {
    await watchEvents(page)
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    await expect(page.locator(`[${SLOT}] iframe`)).toHaveCSS('height', '120px')
    const rendered = async () =>
      (await eventNames(page)).filter((name) => name === 'rendered').length
    expect(await rendered()).toBe(1)
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe') as HTMLIFrameElement
      document.body.appendChild(iframe)
    })
    // The frame's document is loaded again and its module draws again, but the unit already
    // reported `rendered`: the page hears nothing new.
    await expect(
      page.frameLocator('body > iframe').getByRole('link', { name: 'Learn more' }),
    ).toBeVisible()
    await page.waitForTimeout(300)
    expect(await rendered()).toBe(1)
  })

  test('the theme in the address is the first paint, and the scheme is always declared', async ({
    page,
  }) => {
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page, { theme: { scheme: 'dark', accent: '#0a7a3c', radius: '8px' } })
    await mountUnit(page, { props: { text: 'x', href: 'https://example.test/page' } })
    await expect.poll(() => apiFrame(page) !== undefined).toBe(true)
    await expect(link(page)).toBeVisible()
    const style = await apiFrame(page)!.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      return {
        scheme: root.colorScheme,
        accent: root.getPropertyValue('--sdk-accent').trim(),
        radius: root.getPropertyValue('--sdk-radius').trim(),
        margin: getComputedStyle(document.body).margin,
      }
    })
    expect(style).toEqual({ scheme: 'dark', accent: '#0a7a3c', radius: '8px', margin: '0px' })
  })

  test('the link opens in a new tab with no opener, and only over https', async ({ page }) => {
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    await expect(link(page)).toHaveAttribute('target', '_blank')
    await expect(link(page)).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(link(page)).toHaveAttribute('href', /^https:\/\//)
  })
})
