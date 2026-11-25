import { expect, test, type Page } from '@playwright/test'

import { API_ORIGIN, LISTED_ORIGIN, SDK_KEY, UNLISTED_ORIGIN } from './hosts'
import { hostEvents, loadSdk } from './support'

// V15, first half: who may frame the unit, and what the page can reach of it.
test.describe('a frame only where it may be', () => {
  test('an unlisted origin gets a blank frame, a collapsed container and no error', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    // The nested page is on the listed origin, so its read of the config passes; the frame is
    // refused because its other ancestor, the page above, is not listed. The queue puts the
    // host's collectors in place before the loader runs, in the nested page only.
    await page.addInitScript((listed) => {
      if (location.origin !== listed) return
      const w = window as unknown as Record<string, unknown>
      const events: unknown[] = []
      w['__events'] = events
      w['__SDK_GLOBAL__'] = (['rendered', 'viewed', 'clicked', 'error'] as const).map((name) => [
        'on',
        name,
        (event: unknown) => events.push(event),
      ])
    }, LISTED_ORIGIN)
    await page.goto(`${UNLISTED_ORIGIN}/nested.html`)
    const nested = () => page.frames().find((frame) => frame.url().endsWith('/guest.html'))
    await expect.poll(() => nested() !== undefined).toBe(true)
    // The container collapses once the handshake times out: it is the only signal there is.
    await expect(nested()!.locator('[data-sdk-slot] > div')).toHaveCSS('display', 'none', {
      timeout: 15_000,
    })
    await expect(nested()!.locator('[data-sdk-slot] iframe')).toHaveCount(1)
    expect(
      await nested()!.evaluate(() => (window as unknown as { __events: unknown[] }).__events),
    ).toEqual([])
    // The refused frame is blank in every engine: its document is an error page (Chromium), an
    // empty one (Firefox, which also reports no address at times) or holds nothing of the unit
    // (WebKit keeps its address).
    const refused = page.frames().filter((frame) => frame.parentFrame() === nested())
    expect(refused).toHaveLength(1)
    const url = refused[0]!.url()
    if (url.startsWith(API_ORIGIN)) {
      expect(await refused[0]!.locator('[data-fixture-block]').count()).toBe(0)
    } else {
      expect(['', 'about:blank', 'chrome-error://chromewebdata/']).toContain(url)
    }
    expect(pageErrors).toEqual([])
  })

  test('a page of an unlisted origin is refused the config: no frame, one error', async ({
    page,
  }) => {
    await page.goto(`${UNLISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await expect
      .poll(async () => (await hostEvents(page)).map((event) => event.name))
      .toEqual(['error'])
    await expect(page.locator('iframe')).toHaveCount(0)
  })

  test('the page reads nothing of the frame', async ({ page }) => {
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    const iframe = page.locator('[data-sdk-slot] iframe')
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
  })

  const link = (page: Page) =>
    page.frameLocator('[data-sdk-slot] iframe').getByRole('link', { name: 'Learn more' })

  test('a click the page synthesizes never reaches the frame; a real one does', async ({
    page,
    context,
  }) => {
    await context.route('https://example.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>offer</title>' }),
    )
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await expect(page.locator('[data-sdk-slot] iframe')).toHaveCSS('height', '120px')
    await expect(link(page)).toBeVisible()

    await page.evaluate(() => {
      const element = document.querySelector('iframe') as HTMLIFrameElement
      element.click()
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }))
      element.contentWindow?.postMessage({ type: 'click' }, '*')
    })
    const seen = async () =>
      (await hostEvents(page)).map((event) => event.name).filter((name) => name !== 'viewed')
    expect(await seen()).toEqual(['rendered'])

    const popup = context.waitForEvent('page')
    await link(page).click()
    expect((await popup).url()).toBe('https://example.test/offer')
    await expect.poll(seen).toEqual(['rendered', 'clicked'])
  })

  test('a moved frame reloads and shakes hands again', async ({ page }) => {
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await expect(page.locator('[data-sdk-slot] iframe')).toHaveCSS('height', '120px')
    const rendered = async () =>
      (await hostEvents(page)).filter((event) => event.name === 'rendered').length
    expect(await rendered()).toBe(1)
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe') as HTMLIFrameElement
      document.body.appendChild(iframe)
    })
    // The frame's document is loaded again: its module starts again and reports again.
    await expect.poll(rendered).toBe(2)
    await expect(
      page.frameLocator('body > iframe').getByRole('link', { name: 'Learn more' }),
    ).toBeVisible()
  })

  test('the theme in the address is the first paint, and the scheme is always declared', async ({
    page,
  }) => {
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page, { theme: { scheme: 'dark', accent: '#0a7a3c', radius: '8px' } })
    const frame = () =>
      page.frames().find((candidate) => candidate.url().startsWith(`${API_ORIGIN}/api/sdk/frame/`))
    await expect.poll(() => frame() !== undefined).toBe(true)
    await expect(link(page)).toBeVisible()
    const style = await frame()!.evaluate(() => {
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
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await expect(link(page)).toHaveAttribute('target', '_blank')
    await expect(link(page)).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(link(page)).toHaveAttribute('href', /^https:\/\//)
  })
})
