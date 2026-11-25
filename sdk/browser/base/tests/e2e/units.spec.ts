import { expect, test } from '@playwright/test'

import { GLOBAL, LISTED_ORIGIN } from './hosts'
import {
  apiFrame,
  callUnit,
  eventNames,
  fixtureBlock,
  hostEvents,
  loadSdk,
  mountUnit,
  settle,
  unitFrame,
} from './support'

// A unit is one mounted instance of a module. The host mounts it through the global, and every
// event the host sees names its module and its unit.
const PAGE = 'https://example.test/page'

async function open(page: import('@playwright/test').Page, props: Record<string, unknown> = {}) {
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await loadSdk(page)
  return mountUnit(page, { props })
}

test.describe('a unit', () => {
  test('is drawn by `mount` and reports `rendered` with its module and unit', async ({ page }) => {
    const id = await open(page, { text: 'A unit' })
    expect(id).toBe('u1')
    await expect(page.locator('[data-place] iframe')).toHaveCount(1)
    await expect(fixtureBlock(page)).toContainText('A unit')
    await expect
      .poll(async () => (await hostEvents(page)).filter((event) => event.name === 'rendered'))
      .toEqual([{ name: 'rendered', module: 'fixture', unit: 'u1' }])
  })

  test('has the size of its document by the time `rendered` is reported', async ({ page }) => {
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await page.waitForFunction(
      (name) => typeof (window as unknown as Record<string, { mount?: unknown }>)[name]?.mount,
      GLOBAL,
    )
    // The usual stub, run after the file has loaded: the global answers `push`.
    await page.evaluate((global) => {
      const win = window as unknown as Record<string, unknown> & { __height?: number | undefined }
      const stub = (win[global] = win[global] || []) as { push(...entries: unknown[]): void }
      stub.push([
        'on',
        'rendered',
        () => {
          win.__height = document.querySelector('iframe')?.getBoundingClientRect().height
        },
      ])
    }, GLOBAL)
    await mountUnit(page, { props: { text: 'A unit' } })
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __height?: number | undefined }).__height),
      )
      .not.toBeUndefined()
    const atRendered = await page.evaluate(
      () => (window as unknown as { __height?: number | undefined }).__height,
    )
    const content = await apiFrame(page)!.evaluate(() =>
      Math.round(document.documentElement.getBoundingClientRect().height),
    )
    expect(Math.round(atRendered ?? -1)).toBe(content)
  })

  test('numbers each unit and names it in every event', async ({ page }) => {
    await open(page, { text: 'first' })
    await expect(page.locator('iframe')).toHaveCount(1)
    await page.evaluate(() => {
      const place = document.querySelector('[data-place]') as HTMLElement
      const second = document.createElement('div')
      second.setAttribute('data-second', '')
      place.after(second)
    })
    expect(await mountUnit(page, { target: '[data-second]', props: { text: 'second' } })).toBe('u2')
    await expect(page.locator('iframe')).toHaveCount(2)
    await expect
      .poll(async () =>
        (await hostEvents(page))
          .filter((event) => event.name === 'rendered')
          .map((event) => event.unit)
          .sort(),
      )
      .toEqual(['u1', 'u2'])
  })

  test('reports a click of the module as `fixture:clicked`, a real one and not a synthesized one', async ({
    page,
    context,
  }) => {
    await context.route('https://example.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>page</title>' }),
    )
    await open(page, { text: 'x', href: PAGE })
    const link = unitFrame(page).getByRole('link', { name: 'Learn more' })
    await expect(page.locator('[data-place] iframe')).toHaveCSS('height', '120px')
    await expect(link).toBeVisible()

    await page.evaluate(() => {
      const element = document.querySelector('iframe') as HTMLIFrameElement
      element.click()
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }))
      element.contentWindow?.postMessage({ type: 'click' }, '*')
      element.contentWindow?.postMessage({ type: 'emit', name: 'clicked' }, '*')
    })
    const seen = async () => (await eventNames(page)).filter((name) => name !== 'fixture:viewed')
    expect(await seen()).toEqual(['rendered'])

    const popup = context.waitForEvent('page')
    await link.click()
    expect((await popup).url()).toBe(PAGE)
    await expect.poll(seen).toEqual(['rendered', 'fixture:clicked'])
    expect((await hostEvents(page)).find((event) => event.name === 'fixture:clicked')).toEqual({
      name: 'fixture:clicked',
      module: 'fixture',
      unit: 'u1',
    })
  })

  test('redraws on `update`', async ({ page }) => {
    const id = await open(page, { text: 'first' })
    await expect(fixtureBlock(page)).toHaveText('first')
    await callUnit(page, id, { update: { text: 'second' } })
    await expect(fixtureBlock(page)).toHaveText('second')
    await expect(page.locator('iframe')).toHaveCount(1)
  })

  test('is removed by `close`, which reports `closed` with the reason host', async ({ page }) => {
    const id = await open(page, { text: 'x' })
    await expect(fixtureBlock(page)).toBeVisible()
    const before = await page.locator('[data-place]').evaluate((el) => el.childElementCount)
    expect(before).toBe(1)
    await callUnit(page, id, { close: true })
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(await page.locator('[data-place]').evaluate((el) => el.childElementCount)).toBe(0)
    expect((await hostEvents(page)).at(-1)).toEqual({
      name: 'closed',
      module: 'fixture',
      unit: 'u1',
      reason: 'host',
    })
  })

  test('is closed by its own frame, with the reason frame', async ({ page }) => {
    await open(page, { closable: true })
    await unitFrame(page).getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('iframe')).toHaveCount(0)
    expect((await hostEvents(page)).at(-1)).toEqual({
      name: 'closed',
      module: 'fixture',
      unit: 'u1',
      reason: 'frame',
    })
  })

  test('a module that fails reports an error with a code, then closes with `failed`', async ({
    page,
  }) => {
    await open(page, { fail: true })
    await expect
      .poll(() => hostEvents(page))
      .toEqual([
        { name: 'error', code: 'module_failed', module: 'fixture', unit: 'u1' },
        { name: 'closed', module: 'fixture', unit: 'u1', reason: 'failed' },
      ])
    await expect(page.locator('iframe')).toHaveCount(0)
  })

  test('an unknown module and a missing target are errors, and nothing is drawn', async ({
    page,
  }) => {
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await loadSdk(page)
    await mountUnit(page, { module: 'nope' })
    await mountUnit(page, { target: '[data-missing]' })
    await settle(page)
    expect(await hostEvents(page)).toEqual([
      { name: 'error', code: 'unknown_module', module: 'nope', unit: 'u1' },
      { name: 'error', code: 'bad_target', module: 'fixture', unit: 'u2' },
    ])
    await expect(page.locator('iframe')).toHaveCount(0)
  })

  test('props that are too large are refused, never sent to the frame', async ({ page }) => {
    await open(page, { text: 'ok' })
    await expect(fixtureBlock(page)).toHaveText('ok')
    await callUnit(page, 'u1', { update: { text: 'x'.repeat(9000) } })
    await expect
      .poll(async () => (await hostEvents(page)).map((event) => event.code))
      .toContain('props_too_large')
    await expect(fixtureBlock(page)).toHaveText('ok')
  })
})
