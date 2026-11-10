import { expect, test } from '@playwright/test'

import { expectNoAxeViolations, expectNoHorizontalOverflow, expectTouchTargets } from './support'

// The 404 is the template's one screen with a control, so the control checks run on it.
const NOT_FOUND = '/no/such/page'
const HOME_CONTROL = { name: 'Back to the home page' }

test('the skip link is first in the tab order and moves focus to main', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  expect((await skip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)

  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
  expect(new URL(page.url()).pathname).toBe('/')

  await expectNoAxeViolations(page)
})

test('the page has exactly one main, with the id the skip link points at', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('main')).toHaveAttribute('id', 'main')
})

for (const path of ['/', NOT_FOUND]) {
  test(`${path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await expectNoAxeViolations(page)
  })
}

test('an unknown URL renders not-found inside main', async ({ page }) => {
  await page.goto(NOT_FOUND)

  await expect(page.locator('main')).toHaveCount(1)
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible()
})

// `data-density="compact"` is a generation setting; setting it here exercises the same CSS
// without a second build. Compact tightens the page container's spacing, here its block padding.
test('compact density tightens the page container', async ({ page }) => {
  await page.goto(NOT_FOUND)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const padding = () =>
    page
      .locator('main .page-container')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBlockStart))

  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-density')
  })
  expect(await padding()).toBe(24)

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-density', 'compact')
  })
  expect(await padding()).toBe(16)
})

// The 404 has one control, its way home; the skip link is clipped until focused, so it is outside
// the set. Counting it keeps the check from passing on an empty page.
test('the 404 control is a 44 px touch target', { tag: '@phone' }, async ({ page }) => {
  await page.goto(NOT_FOUND)
  await expect(page.getByRole('link', HOME_CONTROL)).toBeVisible()

  await expectTouchTargets(page, 44, 1)
  await expectNoAxeViolations(page)
})

// Compact tightens spacing and never shrinks a touch target.
test(
  'compact density does not shrink the 404 control on the phone project',
  { tag: '@phone' },
  async ({ page }) => {
    await page.goto(NOT_FOUND)
    await expect(page.getByRole('link', HOME_CONTROL)).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })

    await expectTouchTargets(page, 44, 1)
  },
)

test(
  'the 404 control keeps the desktop densities on the desktop project',
  { tag: '@desktop' },
  async ({ page }) => {
    await page.goto(NOT_FOUND)
    await expect(page.getByRole('link', HOME_CONTROL)).toBeVisible()

    // The generated density is not the test's business: clear it for the comfortable size, then
    // set compact. Polled because the control sizes animate.
    const height = async () => (await page.getByRole('link', HOME_CONTROL).boundingBox())?.height

    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-density')
    })
    await expect.poll(height).toBe(36)

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })
    await expect.poll(height).toBe(32)

    await expectNoAxeViolations(page)
  },
)
