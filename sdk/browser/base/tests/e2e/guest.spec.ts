import { expect, test } from '@playwright/test'

import { GLOBAL, LISTED_ORIGIN, LOADER_URL, SDK_KEY, SLOT } from './hosts'
import { recorded, recorder, settle, watchEvents, windowNames } from './support'

// V08: the SDK as a guest on a host page served under `default-src 'none'; script-src 'self'
// <API origin>; connect-src <API origin>; frame-src <API origin>`, on another site than the API.
test.describe('a guest under a strict policy', () => {
  test('loads, shakes hands and sizes itself without a mark on the page', async ({ page }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.addInitScript(recorder)

    // The loader is held back so the page can be measured as it was.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(LOADER_URL, async (route) => {
      await gate
      await route.continue()
    })
    await page.goto(`${LISTED_ORIGIN}/guest.html`, { waitUntil: 'domcontentloaded' })
    const before = await windowNames(page)
    const markupBefore = await page.locator('body').innerHTML()
    expect(markupBefore).not.toContain('<iframe')
    release()

    // The block is 120px tall and the placeholder 60px: only the frame's own report gets here.
    const iframe = page.locator(`[${SLOT}] iframe`)
    await expect(iframe).toHaveCount(1)
    await expect(iframe).toHaveCSS('height', '120px')
    expect(page.frames()).toHaveLength(2)

    const after = await windowNames(page)
    expect(after.filter((name) => !before.includes(name))).toEqual([GLOBAL])
    expect(before.filter((name) => !after.includes(name))).toEqual([])
    expect(
      await page.evaluate(
        (name) => Object.keys((window as unknown as Record<string, object>)[name] ?? {}).sort(),
        GLOBAL,
      ),
    ).toEqual([
      'destroy',
      'init',
      'mount',
      'on',
      'open',
      'push',
      'setConsent',
      'setTheme',
      'version',
    ])

    // `init` twice is one instance.
    await page.evaluate(
      ({ name, key }) => {
        const sdk = (window as unknown as Record<string, { init(o: object): void }>)[name]
        sdk?.init({ key })
        sdk?.init({ key })
      },
      { name: GLOBAL, key: SDK_KEY },
    )
    await settle(page)
    await expect(page.locator('iframe')).toHaveCount(1)

    const logs = await recorded(page)
    expect(logs.flatMap((log) => log.violations)).toEqual([])
    expect(logs.flatMap((log) => log.errors)).toEqual([])
    expect(logs.flatMap((log) => log.rejections)).toEqual([])
    // The page gets no listener from the SDK at any time and no observer unless it asked for one.
    expect(logs[0]?.listeners).toEqual([])
    expect(logs[0]?.observers).toEqual([])
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
    // Only a container with the iframe was added, inside the slot: the rest of the page is as it was.
    const shape = await page.evaluate((slot) => {
      const place = document.querySelector(`[${slot}]`) as HTMLElement
      const container = place.firstElementChild
      const children = [...(container?.children ?? [])].map((child) => child.tagName)
      const count = place.childElementCount
      place.replaceChildren()
      return { count, children, rest: document.body.innerHTML }
    }, SLOT)
    expect(shape.count).toBe(1)
    expect(shape.children).toEqual(['IFRAME'])
    expect(shape.rest).toBe(markupBefore)
  })

  test('destroy takes every unit off the page and leaves no listener and no observer', async ({
    page,
  }) => {
    await page.addInitScript(recorder)
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    await expect(page.locator('iframe')).toHaveCount(1)
    await page.evaluate((name) => {
      ;(window as unknown as Record<string, { destroy(): void }>)[name]?.destroy()
    }, GLOBAL)
    await expect(page.locator('iframe')).toHaveCount(0)
    const logs = await recorded(page)
    expect(logs[0]?.listeners).toEqual([])
    expect(logs[0]?.observers).toEqual([])
  })

  test('data-observe on the tag is the one case that adds an observer', async ({ page }) => {
    await page.addInitScript(recorder)
    await page.goto(`${LISTED_ORIGIN}/observe.html`)
    await expect.poll(async () => (await recorded(page))[0]?.observers).toEqual(['mutation'])
    expect((await recorded(page))[0]?.listeners).toEqual([])
  })

  test('a frame is sandboxed without top navigation and titled', async ({ page }) => {
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    const iframe = page.locator(`[${SLOT}] iframe`)
    await expect(iframe).toHaveCSS('height', '120px')
    const sandbox = await iframe.getAttribute('sandbox')
    expect(sandbox?.split(' ').sort()).toEqual([
      'allow-forms',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ])
    // The title is the module's: the kernel holds no text of its own.
    expect(await iframe.getAttribute('title')).toBe('Fixture unit')
  })

  test('a second tag does nothing: one kernel, one frame', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await watchEvents(page)
    await page.goto(`${LISTED_ORIGIN}/twice.html`)
    await expect(page.locator(`[${SLOT}] iframe`)).toHaveCSS('height', '120px')
    await settle(page)
    await expect(page.locator('iframe')).toHaveCount(1)
    await expect(page.locator(`[${SLOT}] > div`)).toHaveCount(1)
    expect(pageErrors).toEqual([])
  })

  test('a global of the page under the SDK name survives, with no error on the page', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await page.evaluate(
      ({ src, name, key }) => {
        ;(window as unknown as Record<string, unknown>)[name] = { page: 'own' }
        const script = document.createElement('script')
        script.src = src
        script.setAttribute('data-key', key)
        document.head.appendChild(script)
        return new Promise<void>((done) => script.addEventListener('load', () => done()))
      },
      { src: LOADER_URL, name: GLOBAL, key: SDK_KEY },
    )
    await settle(page)
    expect(
      await page.evaluate((name) => (window as unknown as Record<string, unknown>)[name], GLOBAL),
    ).toEqual({ page: 'own' })
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })
})
