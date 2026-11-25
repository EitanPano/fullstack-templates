import { expect, test, type Page } from '@playwright/test'

import { GLOBAL, LISTED_ORIGIN, SLOT, TELEMETRY_URL, UNLISTED_ORIGIN } from './hosts'
import {
  apiFrame,
  callSdk,
  clickToClose,
  eventNames,
  hostEvents,
  LOG_WAIT,
  recorded,
  recorder,
  settle,
  style,
  telemetryLines,
  watchEvents,
} from './support'

// V15, the modal: a unit of a module that declares `display: 'modal'` is opened by `open` in a
// dialog the kernel makes, in a closed shadow root. Each engine does what S3 measured; a row
// that differs is asserted as it is, in its own branch.
const BEHIND = '[data-behind]'
const OPEN = '[data-open]'

const frameOf = (page: Page) => apiFrame(page)!
const body = (page: Page) => page.evaluate(() => document.body.innerHTML)
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('overflow'))

/**
 * A host page whose own button opens the dialog: a real click or key press on it is the user
 * activation a page has when it opens one. The SDK starts from the page's tag, with the host's
 * collectors in place before the loader runs.
 */
async function prepare(page: Page): Promise<void> {
  await page.addInitScript(recorder)
  await watchEvents(page)
  await page.goto(`${LISTED_ORIGIN}/modal.html`)
  await page.waitForFunction(
    (name) => typeof (window as unknown as Record<string, { open?: unknown }>)[name]?.open,
    GLOBAL,
  )
  await page.evaluate((global) => {
    const win = window as unknown as Record<string, unknown>
    const sdk = win[global] as { open(module: string): { id: string } }
    document.querySelector('[data-open]')?.addEventListener('click', () => {
      const unit = sdk.open('fixture-modal')
      ;((win['__sdkUnits'] ??= {}) as Record<string, unknown>)[unit.id] = unit
    })
    document.querySelector('[data-behind]')?.addEventListener('click', () => {
      win['__behind'] = ((win['__behind'] as number | undefined) ?? 0) + 1
    })
  }, GLOBAL)
}

// The unit's iframe is in a closed shadow root: only the page's frames count it.
const frameCount = (page: Page) => page.frames().length

// The key is not awaited. The frame closes the unit while the browser still waits for its key event
// to be handled, and in Chromium the protocol call for the key then does not always answer; the
// close is what each test waits for.
function escape(page: Page): void {
  void page.keyboard.press('Escape').catch(() => undefined)
}

const behindClicks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __behind?: number }).__behind ?? 0)

async function rendered(page: Page): Promise<void> {
  await expect.poll(() => eventNames(page)).toContain('rendered')
}

/** Opens by a real click on the host's button and waits until the frame has drawn. */
async function openByClick(page: Page): Promise<void> {
  await page.locator(OPEN).click()
  await rendered(page)
}

/** The call to the page's global, for what a host script would do. */
const sdkCall = (page: Page, call: 'open' | 'mount' | 'destroy', module?: string) =>
  page.evaluate(
    ({ global, call, module }) => {
      const sdk = (window as unknown as Record<string, Record<string, (...a: unknown[]) => void>>)[
        global
      ]!
      if (call === 'destroy') return sdk['destroy']!()
      if (call === 'mount') return sdk['mount']!(module, document.querySelector('[data-place]'))
      return sdk['open']!(module)
    },
    { global: GLOBAL, call, module },
  )

test.describe('a modal unit', () => {
  test('opens on a real click above every page element, with the page inert behind it', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await prepare(page)
    // The highest z-index there is, over a part of the page the dialog will cover.
    await style(page, '[data-top]', {
      position: 'fixed',
      left: '0',
      top: '300px',
      width: '200px',
      height: '200px',
      'z-index': '2147483647',
      background: 'rgb(255, 0, 0)',
    })
    // The page's own rules for `dialog` and `iframe`, added through the CSSOM: they must not reach it.
    await page.evaluate(() => {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(
        'dialog { display: none !important; } iframe { width: 10px !important; height: 10px !important; }',
      )
      document.adoptedStyleSheets = [sheet]
    })
    const behind = (await page.locator(BEHIND).boundingBox())!
    await openByClick(page)

    const shape = await (
      await frameOf(page).frameElement()
    ).evaluate((node) => {
      const iframe = node as HTMLIFrameElement
      const dialog = iframe.parentElement as HTMLDialogElement
      const box = (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return [x, y, width, height]
      }
      const top = document.querySelector('[data-top]')
      const hit = document.elementFromPoint(100, 400)
      return {
        open: dialog.open,
        tag: dialog.tagName,
        display: getComputedStyle(dialog).display,
        dialog: box(dialog),
        iframe: box(iframe),
        // The element on top at a point under the page's highest z-index is neither it nor any
        // other element of the page: it is the container of the dialog.
        aboveTop: hit !== top && hit?.parentElement === document.body,
      }
    })
    expect(shape.tag).toBe('DIALOG')
    expect(shape.open).toBe(true)
    expect(shape.display).not.toBe('none')
    expect(shape.aboveTop).toBe(true)
    // At 390 by 844 the dialog and the frame fill the viewport, whatever the page's rules say.
    expect(shape.dialog).toEqual([0, 0, 390, 844])
    expect(shape.iframe).toEqual([0, 0, 390, 844])
    expect(await frameOf(page).evaluate(() => [innerWidth, innerHeight])).toEqual([390, 844])

    // A click where a button of the page is lands on the frame: the page behind is inert.
    await page.mouse.click(behind.x + behind.width / 2, behind.y + behind.height / 2)
    await settle(page)
    expect(await behindClicks(page)).toBe(0)

    const logs = await recorded(page)
    expect(logs.flatMap((log) => log.violations)).toEqual([])
    expect(logs.flatMap((log) => log.errors)).toEqual([])
    expect(logs.flatMap((log) => log.rejections)).toEqual([])
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('takes the focus into the frame, where typing lands, and the form checks and submits', async ({
    page,
  }) => {
    await prepare(page)
    await openByClick(page)
    const frame = frameOf(page)
    await expect
      .poll(() => frame.evaluate(() => document.activeElement?.id))
      .toBe('fixture-modal-field')
    await page.keyboard.type('abc')
    await expect(frame.locator('input')).toHaveValue('abc')

    // An empty submit sends no `submitted`: the field is invalid and the module's own line shows.
    await frame.locator('input').fill('')
    await frame.locator('button[type="submit"]').click()
    await expect(frame.locator('input')).toHaveAttribute('aria-invalid', 'true')
    await expect(frame.locator('input')).toHaveAttribute('aria-describedby', 'fixture-modal-error')
    await expect(frame.locator('#fixture-modal-error')).toBeVisible()
    await settle(page)
    expect(await eventNames(page)).toEqual(['rendered'])

    // A valid one is reported, then the unit closes itself and leaves nothing.
    await frame.locator('input').fill('an answer')
    clickToClose(frame.locator('button[type="submit"]'))
    await expect
      .poll(() => hostEvents(page))
      .toEqual([
        { name: 'rendered', module: 'fixture-modal', unit: 'u1' },
        { name: 'fixture-modal:submitted', module: 'fixture-modal', unit: 'u1' },
        { name: 'closed', module: 'fixture-modal', unit: 'u1', reason: 'frame' },
      ])
    await expect.poll(() => frameCount(page)).toBe(1)
  })

  test('closes with frame from its close button, and the page works again', async ({ page }) => {
    await prepare(page)
    await openByClick(page)
    clickToClose(frameOf(page).locator('[data-fixture-modal-close]'))
    await expect
      .poll(async () => (await hostEvents(page)).map((event) => event.reason))
      .toContain('frame')
    await page.locator(BEHIND).click()
    expect(await behindClicks(page)).toBe(1)
  })

  test('closes on Escape in the frame, and leaves what the page had as it was', async ({
    page,
  }) => {
    await prepare(page)
    const before = await body(page)
    await openByClick(page)
    expect(await body(page)).not.toBe(before)
    escape(page)
    await expect
      .poll(async () => (await hostEvents(page)).filter((event) => event.name === 'closed'))
      .toEqual([{ name: 'closed', module: 'fixture-modal', unit: 'u1', reason: 'frame' }])
    expect(await body(page)).toBe(before)
  })

  test('gives the focus back to its opener after a keyboard open, in every engine', async ({
    page,
  }) => {
    await prepare(page)
    await page.locator(OPEN).focus()
    await page.keyboard.press('Enter')
    await rendered(page)
    escape(page)
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-open')))
      .toBe(true)
  })

  test('gives the focus back after a mouse open, as each engine focuses a button', async ({
    page,
  }) => {
    await prepare(page)
    // Whether a click focuses a button is the engine's and the platform's: Safari's WebKit
    // focuses none, WebKit on Linux does. Another button of the page says which one runs.
    await page.locator(BEHIND).click()
    const focusesOnClick = await page.evaluate(
      (behind) => document.activeElement === document.querySelector(behind),
      BEHIND,
    )
    await openByClick(page)
    escape(page)
    await expect
      .poll(async () => (await hostEvents(page)).some((event) => event.name === 'closed'))
      .toBe(true)
    // Where a click focuses no button the opener was the body and there is nothing to return
    // to: focus falls to the body, as for a dialog of the page's own.
    const active = await page.evaluate(() =>
      document.activeElement === document.body
        ? 'body'
        : document.activeElement?.hasAttribute('data-open')
          ? 'opener'
          : 'other',
    )
    expect(active).toBe(focusesOnClick ? 'opener' : 'body')
  })

  test('locks the scroll of the page while open and puts it back, also what the page set', async ({
    page,
  }) => {
    await prepare(page)
    await page.locator(OPEN).click()
    await rendered(page)
    expect(await overflow(page)).toBe('hidden')
    escape(page)
    await expect.poll(() => overflow(page)).toBe('')

    await style(page, 'html', { overflow: 'scroll' })
    await page.locator(OPEN).click()
    await expect.poll(() => overflow(page)).toBe('hidden')
    await expect
      .poll(async () => (await eventNames(page)).filter((name) => name === 'rendered'))
      .toHaveLength(2)
    escape(page)
    await expect.poll(() => overflow(page)).toBe('scroll')
  })

  test('refuses a second modal and a display that is not the module’s', async ({ page }) => {
    await prepare(page)
    await openByClick(page)
    await sdkCall(page, 'open', 'fixture-modal')
    await sdkCall(page, 'mount', 'fixture-modal')
    await sdkCall(page, 'open', 'fixture')
    await expect
      .poll(async () =>
        (await hostEvents(page))
          .filter((event) => event.name === 'error')
          .map((event) => [event.code, event.module]),
      )
      .toEqual([
        ['modal_open', 'fixture-modal'],
        ['bad_display', 'fixture-modal'],
        ['bad_display', 'fixture'],
      ])
  })

  test('refuses a slot of a modal module with bad_slot', async ({ page }) => {
    await prepare(page)
    await page.evaluate(
      ({ attribute }) => {
        const slot = document.createElement('div')
        slot.setAttribute(attribute, 'fixture-modal')
        document.body.appendChild(slot)
      },
      { attribute: SLOT },
    )
    await settle(page)
    await expect
      .poll(() => hostEvents(page))
      .toEqual([{ name: 'error', code: 'bad_slot', module: 'fixture-modal' }])
    expect(frameCount(page)).toBe(1)
  })

  test('is closed with host by the SDK’s destroy, and the page is whole again', async ({
    page,
  }) => {
    await prepare(page)
    const before = await body(page)
    await openByClick(page)
    await sdkCall(page, 'destroy')
    await expect
      .poll(async () => (await hostEvents(page)).filter((event) => event.name === 'closed'))
      .toEqual([{ name: 'closed', module: 'fixture-modal', unit: 'u1', reason: 'host' }])
    expect(await body(page)).toBe(before)
    expect(await overflow(page)).toBe('')
    await page.locator(BEHIND).click()
    expect(await behindClicks(page)).toBe(1)
  })

  test('sends what the modal tracked when its page is left, and nothing twice', async ({
    page,
  }) => {
    const sent: unknown[] = []
    await page.route(TELEMETRY_URL, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const response = await route.fetch()
      sent.push(route.request().postDataJSON() as unknown)
      return route.fulfill({ response })
    })
    await prepare(page)
    await callSdk(page, { setConsent: 'granted' })
    await openByClick(page)
    // The item is in the frame's buffer; the page being left drains it, and a modal frame is no
    // different from an inline one.
    await frameOf(page).evaluate(() => window.dispatchEvent(new Event('pagehide')))
    await expect.poll(() => sent).toEqual([{ events: [{ name: 'opened' }] }])

    // Closing sends what is left. Here nothing is: the buffer was drained, so nothing is sent twice.
    escape(page)
    await expect.poll(() => frameCount(page)).toBe(1)
    await settle(page)
    expect(sent).toHaveLength(1)
  })

  test('sends what the modal tracked once it is closed', async ({ page, browserName }) => {
    const sent: unknown[] = []
    await page.route(TELEMETRY_URL, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const response = await route.fetch()
      sent.push(route.request().postDataJSON() as unknown)
      return route.fulfill({ response })
    })
    await prepare(page)
    await callSdk(page, { setConsent: 'granted' })
    await openByClick(page)
    const before = telemetryLines()
    escape(page)
    await expect.poll(() => frameCount(page)).toBe(1)
    // The server's own output, in every engine (as for an inline unit, telemetry.spec.ts):
    // Playwright does not always report a request of a frame removed in the same task.
    await expect.poll(telemetryLines, LOG_WAIT).toBeGreaterThan(before)
    if (browserName === 'webkit') await expect.poll(() => sent.length).toBe(1)
    // What a route did see is the one batch, never a second.
    await settle(page)
    expect([[], [{ events: [{ name: 'opened' }] }]]).toContainEqual(sent)
  })
})

test.describe('a page that swaps its body under a modal', () => {
  test('gets its scroll and a second dialog back, and closed arrives with host', async ({
    page,
  }) => {
    await prepare(page)
    await openByClick(page)
    // What Turbo Drive and htmx boosting do on a visit: the body is replaced, the container with it.
    await page.evaluate(() => {
      const next = document.createElement('main')
      next.style.setProperty('height', '4000px')
      document.body.replaceChildren(next)
    })
    await expect
      .poll(async () => (await hostEvents(page)).filter((event) => event.name === 'closed'))
      .toEqual([{ name: 'closed', module: 'fixture-modal', unit: 'u1', reason: 'host' }])
    expect(await overflow(page)).toBe('')
    await page.mouse.move(100, 100)
    await page.mouse.wheel(0, 600)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    await sdkCall(page, 'open', 'fixture-modal')
    await expect
      .poll(async () => (await eventNames(page)).filter((name) => name === 'rendered'))
      .toHaveLength(2)
    expect((await hostEvents(page)).filter((event) => event.name === 'error')).toEqual([])
    expect(await overflow(page)).toBe('hidden')
    await expect.poll(() => frameCount(page)).toBe(2)
  })
})

test.describe('a modal told denied and closed in one task', () => {
  test('sends nothing of what it had buffered', async ({ page }) => {
    const sent: unknown[] = []
    await page.route(TELEMETRY_URL, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const response = await route.fetch()
      sent.push(route.request().postDataJSON() as unknown)
      return route.fulfill({ response })
    })
    await prepare(page)
    await callSdk(page, { setConsent: 'granted' })
    await openByClick(page)
    await page.evaluate((global) => {
      const win = window as unknown as {
        __sdkUnits: Record<string, { close(): void }>
      } & Record<string, { setConsent(state: string): void }>
      win[global]!.setConsent('denied')
      win.__sdkUnits['u1']!.close()
    }, GLOBAL)
    await expect.poll(() => frameCount(page)).toBe(1)
    await settle(page)
    await page.waitForTimeout(500)
    // The row that sees a frame's last request is WebKit's; the others see the unit gone.
    expect(sent).toEqual([])
  })
})

test.describe('a modal where the page is not listed', () => {
  test('closes with timeout and the page is never inert and keeps nothing of the SDK', async ({
    page,
  }) => {
    // The nested page is on the listed origin, so its read of the config passes; the frame is
    // refused because its other ancestor, the page above it, is not listed.
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
        win['__behind'] = 0
        document.addEventListener('DOMContentLoaded', () => {
          document
            .querySelector('[data-behind]')
            ?.addEventListener('click', () => (win['__behind'] = (win['__behind'] as number) + 1))
        })
      },
      { listed: LISTED_ORIGIN, global: GLOBAL },
    )
    await page.goto(`${UNLISTED_ORIGIN}/nested-modal.html`)
    const nested = () => page.frames().find((frame) => frame.url().endsWith('/modal.html'))
    await expect.poll(() => nested() !== undefined).toBe(true)
    await nested()!.waitForFunction(
      (name) => typeof (window as unknown as Record<string, { open?: unknown }>)[name]?.open,
      GLOBAL,
    )
    const before = await nested()!.evaluate(() => document.body.innerHTML)
    await nested()!.evaluate((global) => {
      ;(window as unknown as Record<string, { open(module: string): void }>)[global]!.open(
        'fixture-modal',
      )
    }, GLOBAL)

    // While the handshake is awaited nothing is shown: the page behind still takes clicks.
    await nested()!.locator(BEHIND).click()
    expect(
      await nested()!.evaluate(() => (window as unknown as { __behind: number }).__behind),
    ).toBe(1)

    await expect
      .poll(
        () =>
          nested()!.evaluate(() => (window as unknown as { __sdkEvents: unknown[] }).__sdkEvents),
        { timeout: 15_000 },
      )
      .toEqual([{ name: 'closed', module: 'fixture-modal', unit: 'u1', reason: 'timeout' }])
    expect(await nested()!.evaluate(() => document.body.innerHTML)).toBe(before)
    expect(await nested()!.evaluate(() => document.documentElement.style.overflow)).toBe('')
    await nested()!.locator(BEHIND).click()
    expect(
      await nested()!.evaluate(() => (window as unknown as { __behind: number }).__behind),
    ).toBe(2)
  })
})
