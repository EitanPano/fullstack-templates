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

// A full-bleed screen fills the viewport without a layout prop: main takes the rest of the column.
test('main reaches the bottom of the viewport on a short page', async ({ page }) => {
  await page.goto('/')

  const bottom = await page.locator('main').evaluate((main) => main.getBoundingClientRect().bottom)
  const viewport = await page.evaluate(() => window.innerHeight)
  expect(bottom).toBeGreaterThanOrEqual(viewport - 1)
})

test('an unknown URL renders not-found inside main', async ({ page }) => {
  await page.goto('/no/such/page')

  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.getByRole('main').getByText('Page not found')).toBeVisible()
})

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
  'controls keep the desktop densities on the desktop project',
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

// The page container owns the vertical padding (main has none): 24 px comfortable, 16 px compact,
// the values `main` carried before 5.0.0.
test(
  'compact density tightens the page container padding on the desktop project',
  { tag: '@desktop' },
  async ({ page }) => {
    await page.goto('/')
    const padding = () =>
      page.locator('main > .page').evaluate((element) => ({
        top: getComputedStyle(element).paddingBlockStart,
        bottom: getComputedStyle(element).paddingBlockEnd,
        main: getComputedStyle(element.parentElement as HTMLElement).paddingBlockStart,
      }))

    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-density')
    })
    expect(await padding()).toEqual({ top: '24px', bottom: '24px', main: '0px' })

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })
    expect(await padding()).toEqual({ top: '16px', bottom: '16px', main: '0px' })
  },
)

// The no-flash theme script is a file because the deployed pages carry `script-src 'self'`. In
// container mode this is the nginx or server image's own answer; `vite preview` sets no CSP, so
// there the violation check passes trivially and the content type is what counts.
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
