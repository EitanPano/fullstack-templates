import { expect, test } from '@playwright/test'

import { NOT_FOUND } from './screen-routes'
import {
  collectConsoleProblems,
  cspViolations,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  watchCspViolations,
} from './support'

// The 404 is the template's one screen with a control, so the control checks run on it.
const HOME_CONTROL = { name: 'Back to the home page' }

test('the skip link is first in the tab order and moves focus to main', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

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

test('an unknown URL renders the 404 page inside main', async ({ page }) => {
  await page.goto(NOT_FOUND)

  await expect(page.locator('main')).toHaveCount(1)
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible()
})

// The body is a column at least the viewport high with `main` taking the rest, so a full-bleed
// screen fills the viewport without a layout prop and a footer a product adds sits at the bottom.
test('main reaches the bottom of the viewport on a short page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const gap = await page
    .locator('main')
    .evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)
  expect(gap).toBeLessThanOrEqual(1)
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

test('no page logs a console error or warning', async ({ page }) => {
  const problems = collectConsoleProblems(page, [NOT_FOUND])

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.goto(NOT_FOUND)
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()

  expect(problems).toEqual([])
})

// The no-flash theme script is a file because the deployed pages carry `script-src 'self'`; the
// built site is served with the real policy from dist/_headers, so a violation here is real.
test('the theme script is served as JavaScript and no page raises a CSP violation', async ({
  page,
  request,
}) => {
  const response = await request.get('/theme-init.js')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/javascript/)

  await watchCspViolations(page)
  for (const path of ['/', NOT_FOUND]) {
    await page.goto(path)
    await expect(page.getByRole('main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(await cspViolations(page), path).toEqual([])
  }
})

test('every page is served with the policy and the static security headers', async ({
  request,
}) => {
  for (const path of ['/', NOT_FOUND]) {
    const headers = (await request.get(path)).headers()
    const policy = headers['content-security-policy'] ?? ''

    expect(policy, path).toContain("default-src 'self'")
    expect(policy, path).toContain("frame-ancestors 'none'")
    expect(policy, path).not.toContain('unsafe-inline')
    expect(headers['x-content-type-options'], path).toBe('nosniff')
  }
})
