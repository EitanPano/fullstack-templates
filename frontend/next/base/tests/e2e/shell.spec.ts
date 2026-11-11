import { expect, test, type Page } from '@playwright/test'

import { expectNoSeriousViolations } from './support'

test('the skip link is first in the tab order and moves focus to main', async ({ page }) => {
  await page.goto('/')

  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  const skipBox = await skip.boundingBox()
  expect(skipBox?.height ?? 0).toBeGreaterThanOrEqual(44)

  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()

  await expectNoSeriousViolations(page)
})

test('the page has exactly one main, with the id the skip link points at', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('main')).toHaveAttribute('id', 'main')
})

test('main reaches the bottom of the viewport on a short page', async ({ page }) => {
  await page.goto('/')

  const gap = await page.evaluate(
    () => (document.querySelector('main')?.getBoundingClientRect().bottom ?? 0) - window.innerHeight,
  )
  expect(gap).toBeGreaterThanOrEqual(-1)
})

for (const path of ['/', '/no/such/page']) {
  test(`${path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(path)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await expectNoSeriousViolations(page)
  })
}

test('an unknown URL answers 404 and renders inside main', async ({ page }) => {
  const response = await page.goto('/no/such/page')

  expect(response?.status()).toBe(404)
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.getByRole('main').getByText('Page not found')).toBeVisible()
})

// The 44 px rule is the touch rule, so its checks are tagged @phone and the desktop project
// leaves them out; the shadcn densities are @desktop. The projects in playwright.config.ts select
// by tag, so no test is skipped at run time.

// A locator pierces open shadow roots; a hidden element has no box and is skipped. The skip link
// is visually hidden until focused, so it is outside this set.
async function controlSizes(page: Page) {
  return page.locator('button, main a').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const { width, height } = element.getBoundingClientRect()
      if (width === 0 && height === 0) return []
      return [{ text: element.getAttribute('aria-label') ?? element.textContent, width, height }]
    }),
  )
}

// The 404 has one control, the way back to the start.
async function expectTouchTargets(page: Page) {
  const sizes = await controlSizes(page)
  expect(sizes.map((size) => size.text)).toEqual(['Back to the start'])
  for (const size of sizes) {
    expect(size.width, size.text).toBeGreaterThanOrEqual(44)
    expect(size.height, size.text).toBeGreaterThanOrEqual(44)
  }
}

test('touch targets are 44 px on the phone project only', { tag: '@phone' }, async ({ page }) => {
  await page.goto('/no/such/page')
  await expect(page.getByRole('link', { name: 'Back to the start' })).toBeVisible()

  await expectTouchTargets(page)

  await expectNoSeriousViolations(page)
})

// `--density compact` sets data-density on <html> at generation; setting it here exercises the
// same CSS without a second build (the generator's emission of the attribute is covered by the
// catalog's generator tests). Compact shrinks fine-pointer controls only.
test(
  'compact density does not shrink touch targets on the phone project',
  { tag: '@phone' },
  async ({ page }) => {
    await page.goto('/no/such/page')
    await expect(page.getByRole('link', { name: 'Back to the start' })).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })

    await expectTouchTargets(page)
  },
)

test(
  'controls keep the shadcn densities on the desktop project',
  { tag: '@desktop' },
  async ({ page }) => {
    await page.goto('/no/such/page')

    // The generated density is not the test's business: clear it for the comfortable size, then
    // set compact, as the phone test does. Polled because the control sizes animate.
    const height = async () =>
      (await page.getByRole('link', { name: 'Back to the start' }).boundingBox())?.height

    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-density')
    })
    await expect.poll(height).toBe(36)

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })
    await expect.poll(height).toBe(32)

    await expectNoSeriousViolations(page)
  },
)
