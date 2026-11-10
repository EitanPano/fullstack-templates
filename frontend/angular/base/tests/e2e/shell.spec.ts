import { expect, test } from '@playwright/test'

import { expectNoAxeViolations, expectNoHorizontalOverflow, expectTouchTargets } from './support'

// The template's whole shell is the skip link and the one main; the 404 is the screen these tests
// measure, because it holds a real control and exists whatever the product adds.
const UNKNOWN = '/no/such/page'

test('the skip link is first in the tab order and moves focus to main', async ({ page }) => {
  await page.goto('/')
  // The app renders after the load event: Tab before that reaches nothing.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()

  await expectNoAxeViolations(page)
})

test('the skip link works on a nested screen too', async ({ page }) => {
  // The document has <base href="/">: a bare #main would resolve against it and leave the screen.
  await page.goto(UNKNOWN)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.locator('main#main')).toBeFocused()
  expect(new URL(page.url()).pathname).toBe(UNKNOWN)
})

test('the page has exactly one main, with the id the skip link points at', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('main')).toHaveAttribute('id', 'main')
})

for (const path of ['/', UNKNOWN]) {
  test(`${path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await expectNoAxeViolations(page)
  })
}

test('an unknown URL renders not-found inside main', async ({ page }) => {
  await page.goto(UNKNOWN)

  await expect(page.locator('main')).toHaveCount(1)
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible()
})

// The 404 has one control, its link home; the count is asserted so a screen that loses it does not
// pass on nothing.
test('the 404 control is a 44 px touch target', { tag: '@phone' }, async ({ page }) => {
  await page.goto(UNKNOWN)
  await expect(page.getByRole('link', { name: 'Back to the home page' })).toBeVisible()

  await expectTouchTargets(page, 1, 44)
  await expectNoAxeViolations(page)
})

// `data-density="compact"` is a generation setting; setting it here exercises the same CSS
// without a second build. Compact tightens spacing and never shrinks a touch target.
test(
  'compact density does not shrink a touch target on the phone project',
  { tag: '@phone' },
  async ({ page }) => {
    await page.goto(UNKNOWN)
    await expect(page.getByRole('link', { name: 'Back to the home page' })).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })

    await expectTouchTargets(page, 1, 44)
  },
)

test(
  'compact density tightens spacing and keeps the control on the desktop project',
  { tag: '@desktop' },
  async ({ page }) => {
    await page.goto(UNKNOWN)
    await expect(page.getByRole('link', { name: 'Back to the home page' })).toBeVisible()

    const metrics = () =>
      page.evaluate(() => {
        const container = document.querySelector('main#main app-page')
        const home = document.querySelector('main#main a')
        return {
          fontSize: getComputedStyle(document.body).fontSize,
          pagePadding: container ? parseFloat(getComputedStyle(container).paddingBlockStart) : 0,
          homeHeight: home?.getBoundingClientRect().height ?? 0,
        }
      })

    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-density')
    })
    const comfortable = await metrics()
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })
    const compact = await metrics()

    expect(comfortable.fontSize).toBe('16px')
    expect(compact.fontSize).toBe('14px')
    expect(comfortable.pagePadding).toBeGreaterThan(0)
    expect(compact.pagePadding).toBeLessThan(comfortable.pagePadding)
    // A desktop control keeps its 40 px height in both densities.
    expect(comfortable.homeHeight).toBe(40)
    expect(compact.homeHeight).toBe(40)

    await expectNoAxeViolations(page)
  },
)

// The no-flash theme script is a file because the deployed pages carry `script-src 'self'`. In
// container mode this is the nginx or server image's own answer; the local static server sets no
// CSP, so there the violation check passes trivially and the content type is what counts.
test('the theme script is served as JavaScript and the page raises no CSP violation', async ({
  page,
  request,
}) => {
  const response = await request.get('/theme-init.js')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/javascript/)

  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { cspViolations: violations })
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()

  const violations = await page.evaluate(
    () => (window as unknown as { cspViolations: string[] }).cspViolations,
  )
  expect(violations).toEqual([])
})
