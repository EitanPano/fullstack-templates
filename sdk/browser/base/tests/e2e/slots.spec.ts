import { expect, test, type Page } from '@playwright/test'

import { LISTED_ORIGIN, SLOT } from './hosts'
import { hostEvents, loadSdk, settle, watchEvents } from './support'

// A slot is an element of the page that carries the SDK's attribute: the way a page under a strict
// policy, which cannot run an inline script, configures a unit. Only a module that declares `slot`
// is mounted this way, and only the attributes it lists reach the frame.
const props = (page: Page) =>
  page.frameLocator('iframe').locator('[data-fixture-block]').getAttribute('data-fixture-props')

/** Adds a slot element to the page, as a script or a sanitised fragment would. */
function addSlot(page: Page, attributes: Record<string, string>, area = '[data-area]') {
  return page.evaluate(
    ({ attributes, area, slot }) => {
      const element = document.createElement('div')
      element.setAttribute(slot, attributes['module'] ?? 'fixture')
      for (const [name, value] of Object.entries(attributes)) {
        if (name !== 'module') element.setAttribute(`data-${name}`, value)
      }
      element.setAttribute('data-added', '')
      document.querySelector(area)?.appendChild(element)
    },
    { attributes, area, slot: SLOT },
  )
}

test.describe('slots', () => {
  test('mount with only the props the module lists', async ({ page }) => {
    await watchEvents(page)
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    const frame = page.frameLocator(`[${SLOT}] iframe`)
    await expect(frame.locator('[data-fixture-block]')).toContainText('A unit from a slot')
    // The element also holds `data-secret`: it is not listed, so it stays on the page.
    expect(await props(page)).toBe('href,text')
    await expect(frame.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      'https://example.test/page',
    )
    expect(await page.locator(`[${SLOT}]`).getAttribute('data-secret')).toBe('not for the frame')
  })

  test('a camelCase prop is read from its kebab-case attribute: linkLabel is data-link-label', async ({
    page,
  }) => {
    await watchEvents(page)
    await page.goto(`${LISTED_ORIGIN}/observe.html`)
    await addSlot(page, {
      text: 'x',
      href: 'https://example.test/page',
      'link-label': 'Read the page',
      linklabel: 'not this one',
    })
    const frame = page.frameLocator('[data-added] iframe')
    await expect(frame.getByRole('link', { name: 'Read the page' })).toBeVisible()
    await expect(frame.locator('[data-fixture-block]')).toHaveAttribute(
      'data-fixture-props',
      'href,linkLabel,text',
    )
  })

  test('a slot of a module the build does not declare reports bad_slot and draws nothing', async ({
    page,
  }) => {
    await page.goto(`${LISTED_ORIGIN}/blank.html`)
    await page.evaluate((slot) => {
      const element = document.createElement('div')
      element.setAttribute(slot, 'nope')
      document.querySelector('[data-place]')?.appendChild(element)
    }, SLOT)
    await loadSdk(page)
    await expect
      .poll(() => hostEvents(page))
      .toEqual([{ name: 'error', code: 'bad_slot', module: 'nope' }])
    await expect(page.locator('iframe')).toHaveCount(0)
  })

  test('one added later is not mounted without observe', async ({ page }) => {
    await watchEvents(page)
    await page.goto(`${LISTED_ORIGIN}/guest.html`)
    await expect(page.locator('iframe')).toHaveCount(1)
    await page.evaluate((slot) => {
      const element = document.createElement('div')
      element.setAttribute(slot, 'fixture')
      document.body.appendChild(element)
    }, SLOT)
    await settle(page)
    await settle(page)
    await expect(page.locator('iframe')).toHaveCount(1)
  })

  test.describe('with data-observe on the tag', () => {
    test('one added later is mounted, a removed one closes, one added again is mounted again', async ({
      page,
    }) => {
      await watchEvents(page)
      await page.goto(`${LISTED_ORIGIN}/observe.html`)
      await expect.poll(() => hostEvents(page)).toEqual([])
      await addSlot(page, { text: 'late one' })
      await expect(page.locator('[data-added] iframe')).toHaveCount(1)
      await expect(page.frameLocator('iframe').locator('[data-fixture-block]')).toHaveText(
        'late one',
      )

      // Detach the element and attach it again: the same element, and a new unit.
      await page.evaluate(() => {
        const element = document.querySelector('[data-added]') as HTMLElement
        ;(window as unknown as { __kept: Element }).__kept = element
        element.remove()
      })
      await expect(page.locator('iframe')).toHaveCount(0)
      await expect
        .poll(async () => (await hostEvents(page)).filter((event) => event.name === 'closed'))
        .toEqual([{ name: 'closed', module: 'fixture', unit: 'u1', reason: 'slot_removed' }])

      await page.evaluate(() => {
        document
          .querySelector('[data-area]')
          ?.appendChild((window as unknown as { __kept: Element }).__kept)
      })
      await expect(page.locator('[data-added] iframe')).toHaveCount(1)
      await expect
        .poll(async () =>
          (await hostEvents(page))
            .filter((event) => event.name === 'rendered')
            .map((event) => event.unit),
        )
        .toEqual(['u1', 'u2'])
    })

    test('mounts 50 units and refuses the 51st with too_many_units', async ({ page }) => {
      test.setTimeout(90_000)
      await watchEvents(page)
      await page.goto(`${LISTED_ORIGIN}/observe.html`)
      await page.evaluate((slot) => {
        const area = document.querySelector('[data-area]') as HTMLElement
        for (let n = 0; n < 51; n += 1) {
          const element = document.createElement('div')
          element.setAttribute(slot, 'fixture')
          area.appendChild(element)
        }
      }, SLOT)
      await expect
        .poll(
          async () => (await hostEvents(page)).filter((event) => event.code === 'too_many_units'),
          { timeout: 30_000 },
        )
        .toEqual([{ name: 'error', code: 'too_many_units', module: 'fixture', unit: 'u51' }])
      await expect(page.locator('iframe')).toHaveCount(50)
    })

    test('a slot of an undeclared module added later reports bad_slot', async ({ page }) => {
      await watchEvents(page)
      await page.goto(`${LISTED_ORIGIN}/observe.html`)
      await addSlot(page, { module: 'nope' })
      await expect
        .poll(() => hostEvents(page))
        .toEqual([{ name: 'error', code: 'bad_slot', module: 'nope' }])
      await expect(page.locator('iframe')).toHaveCount(0)
    })
  })
})
