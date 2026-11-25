import { expect, test } from '@playwright/test'

import { LISTED_ORIGIN, LOADER_URL } from './hosts'
import { recorded, recorder, settle, windowNames } from './support'

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
    await page.evaluate(() => {
      ;(window as unknown as { __e2e: { armed: boolean } }).__e2e.armed = true
    })
    release()

    // The block is 120px tall and the placeholder 60px: only the frame's own report gets here.
    const iframe = page.locator('[data-sdk-slot] iframe')
    await expect(iframe).toHaveCount(1)
    await expect(iframe).toHaveCSS('height', '120px')
    expect(page.frames()).toHaveLength(2)

    const after = await windowNames(page)
    expect(after.filter((name) => !before.includes(name))).toEqual(['__SDK_GLOBAL__'])
    expect(before.filter((name) => !after.includes(name))).toEqual([])
    expect(
      await page.evaluate(() =>
        Object.keys((window as unknown as Record<string, object>)['__SDK_GLOBAL__'] ?? {}).sort(),
      ),
    ).toEqual(['destroy', 'init', 'on', 'setConsent', 'version'])

    // `init` twice is one instance.
    await page.evaluate(() => {
      const sdk = (window as unknown as Record<string, { init(o: object): void }>)['__SDK_GLOBAL__']
      sdk?.init({ key: 'pk_e2e_listed' })
      sdk?.init({ key: 'pk_e2e_listed' })
    })
    await settle(page)
    await expect(page.locator('iframe')).toHaveCount(1)

    const logs = await recorded(page)
    expect(logs.flatMap((log) => log.violations)).toEqual([])
    expect(logs.flatMap((log) => log.errors)).toEqual([])
    expect(logs.flatMap((log) => log.rejections)).toEqual([])
    // No listener on the page beyond the container and the iframe: an idle SDK adds none.
    expect(logs[0]?.listeners).toEqual([])
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
    // Only a container with the iframe was added, inside the slot: the rest of the page is as it was.
    const shape = await page.evaluate(() => {
      const slot = document.querySelector('[data-sdk-slot]') as HTMLElement
      const container = slot.firstElementChild
      const children = [...(container?.children ?? [])].map((child) => child.tagName)
      const count = slot.childElementCount
      slot.replaceChildren()
      return { count, children, rest: document.body.innerHTML }
    })
    expect(shape.count).toBe(1)
    expect(shape.children).toEqual(['IFRAME'])
    expect(shape.rest).toBe(markupBefore)
  })

  test('a frame is sandboxed without top navigation and titled', async ({ page }) => {
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    const iframe = page.locator('[data-sdk-slot] iframe')
    await expect(iframe).toHaveCSS('height', '120px')
    const sandbox = await iframe.getAttribute('sandbox')
    expect(sandbox?.split(' ').sort()).toEqual([
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-same-origin',
      'allow-scripts',
    ])
    expect(await iframe.getAttribute('title')).not.toBe('')
  })
})
