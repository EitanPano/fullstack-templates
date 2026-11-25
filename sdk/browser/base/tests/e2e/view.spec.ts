import { expect, test, type Page } from '@playwright/test'

import { LISTED_ORIGIN } from './hosts'
import { hostEvents, loadSdk, mountUnit, style, type Engine, type HostEvent } from './support'

// V15, second half: the view helper (`observeView`), used by the fixture's frame half, which
// emits `fixture:viewed` with the checks that ran. The helper counts a unit that is in view for a
// second and none of the ways of hiding it that every engine can detect (ADR 0020 F4). Where an
// engine cannot detect a way, the spec asserts that: the table below is the documented limit.
//
// A view takes a second to count, so "no view" is observed over a window longer than that. The
// first test shows the window is long enough on the machine that runs it.
const OBSERVE_MS = 3000
const VIEWED = 'fixture:viewed'

const viewed = async (page: Page): Promise<HostEvent[]> =>
  (await hostEvents(page)).filter((event) => event.name === VIEWED)

async function untilRendered(page: Page) {
  await expect
    .poll(async () => (await hostEvents(page)).some((event) => event.name === 'rendered'))
    .toBe(true)
}

/** Observes the page for the window and returns the views it saw. Time is the page's own clock. */
async function observe(page: Page): Promise<HostEvent[]> {
  const start = await page.evaluate(() => performance.now())
  await page.waitForFunction(
    ({ start, ms }) => performance.now() - start >= ms,
    { start, ms: OBSERVE_MS },
    { polling: 100 },
  )
  return viewed(page)
}

async function open(page: Page, hide?: (page: Page) => Promise<void>) {
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await hide?.(page)
  await loadSdk(page)
  await mountUnit(page, { props: { text: 'Seen' } })
  await untilRendered(page)
}

test.describe('a view', () => {
  test('is one `fixture:viewed` after a second in view, naming the checks that ran', async ({
    page,
    browserName,
  }) => {
    await open(page)
    await expect.poll(async () => (await viewed(page)).length, { timeout: OBSERVE_MS }).toBe(1)
    // Chromium has IntersectionObserver v2 (`isVisible`); the others cannot say a unit is covered.
    expect(await viewed(page)).toEqual([
      {
        name: VIEWED,
        module: 'fixture',
        unit: 'u1',
        data: { occlusion: browserName === 'chromium' ? 'checked' : 'unavailable' },
      },
    ])
    // What the host sees names the event and the checks, and holds nothing that proves a view.
    expect(JSON.stringify(await hostEvents(page))).not.toMatch(/token|nonce|signature/i)
    expect(await observe(page)).toHaveLength(1)
  })

  const hidden: Record<string, (page: Page) => Promise<void>> = {
    'moved off screen': (page) =>
      style(page, '[data-wrapper]', { position: 'absolute', left: '-10000px', top: '0' }),
    'scrolled away': (page) => style(page, '[data-spacer]', { height: '3000px' }),
    'scrolled out of a container': async (page) => {
      await style(page, '[data-scroller]', { height: '100px', overflow: 'auto' })
      await style(page, '[data-spacer]', { height: '600px' })
    },
    'shrunk to a pixel': (page) => style(page, '[data-place]', { width: '1px' }),
    'clipped by a parent of one pixel': (page) =>
      style(page, '[data-wrapper]', { width: '1px', height: '1px', overflow: 'hidden' }),
  }
  for (const [way, hide] of Object.entries(hidden)) {
    test(`is none when the unit is ${way}`, async ({ page }) => {
      await open(page, hide)
      expect(await observe(page)).toEqual([])
    })
  }
})

// What each engine can tell, per way of hiding the unit from the page (ADR 0020 F4). `true` is
// a view the helper counts although the unit is hidden: the documented limit of that engine, which
// the server weighs by the event's `occlusion`.
const COUNTED_WHEN_HIDDEN: Record<string, Record<Engine, boolean>> = {
  'displayed as none': { chromium: false, firefox: false, webkit: false },
  'set to visibility hidden': { chromium: false, firefox: true, webkit: true },
  'made fully transparent': { chromium: false, firefox: true, webkit: true },
  'covered by another element': { chromium: false, firefox: true, webkit: true },
  'clipped with a clip path': { chromium: false, firefox: true, webkit: true },
  'scaled down': { chromium: false, firefox: true, webkit: true },
}

const tricks: Record<string, (page: Page) => Promise<void>> = {
  'displayed as none': (page) => style(page, '[data-wrapper]', { display: 'none' }),
  'set to visibility hidden': (page) => style(page, '[data-wrapper]', { visibility: 'hidden' }),
  'made fully transparent': (page) => style(page, '[data-wrapper]', { opacity: '0' }),
  'covered by another element': (page) =>
    style(page, '[data-cover]', {
      position: 'fixed',
      inset: '0',
      background: 'white',
      'z-index': '2147483647',
    }),
  'clipped with a clip path': (page) =>
    style(page, '[data-wrapper]', { 'clip-path': 'inset(100%)' }),
  'scaled down': (page) =>
    style(page, '[data-wrapper]', { transform: 'scale(0.1)', 'transform-origin': '0 0' }),
}

test.describe('what each engine can tell of a hidden unit', () => {
  for (const [way, hide] of Object.entries(tricks)) {
    test(`a unit ${way}`, async ({ page, browserName }) => {
      const counted = COUNTED_WHEN_HIDDEN[way]?.[browserName as Engine]
      await open(page, hide)
      if (counted) {
        // The documented limit: the engine cannot see this, so the view is counted, and its
        // `occlusion` says `unavailable` for the server to weigh.
        await expect.poll(async () => (await viewed(page)).length, { timeout: 10_000 }).toBe(1)
        expect((await viewed(page))[0]?.data).toEqual({ occlusion: 'unavailable' })
      } else {
        expect(await observe(page)).toEqual([])
      }
    })
  }
})
