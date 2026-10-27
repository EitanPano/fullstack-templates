import { expect, test, type Page } from '@playwright/test'

import { expectNoSeriousViolations, isPhone, openMenu } from './support'

async function openPhoneMenu(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Menu' })
  await openMenu(page.getByRole('button', { name: 'Open menu' }), sheet)
  return sheet
}

// The inline nav shows from `md`; on the phone project the same entries sit behind the menu.
async function openNavigation(page: Page) {
  if (isPhone(test.info().project.name)) {
    await openPhoneMenu(page)
  }
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
}

test('the page has the shell landmarks', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  await openNavigation(page)

  await expectNoSeriousViolations(page)
})

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

test('an unknown URL answers 404 inside the shell', async ({ page }) => {
  const response = await page.goto('/no/such/page')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByText('Page not found')).toBeVisible()
})

// The 44 px rule is the touch rule, so its checks are tagged @phone and the desktop project
// leaves them out; the shadcn densities are @desktop. The projects in playwright.config.ts select
// by tag, so no test is skipped at run time.

// A locator pierces open shadow roots; a hidden element (the inline nav under `md`) has no box and
// is skipped. The skip link is visually hidden until focused, so it is outside this set.
async function touchTargetSizes(page: Page) {
  return page.locator('button, header a, main a, footer a').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const { width, height } = element.getBoundingClientRect()
      if (width === 0 && height === 0) return []
      return [{ text: element.getAttribute('aria-label') ?? element.textContent, width, height }]
    }),
  )
}

test('touch targets are 44 px on the phone project only', { tag: '@phone' }, async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()

  const sizes = await touchTargetSizes(page)
  // The menu button, the brand, the account menu and Refresh are all on the page.
  expect(sizes.length).toBeGreaterThanOrEqual(4)
  for (const size of sizes) {
    expect(size.width, size.text).toBeGreaterThanOrEqual(44)
    expect(size.height, size.text).toBeGreaterThanOrEqual(44)
  }

  await expectNoSeriousViolations(page)
})

// `--density compact` sets data-density on <html> at generation; setting it here exercises the
// same CSS without a second build (the generator's emission of the attribute is covered by the
// catalog's generator tests). Compact shrinks fine-pointer controls only.
test(
  'compact density does not shrink touch targets on the phone project',
  { tag: '@phone' },
  async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })

    const sizes = await touchTargetSizes(page)
    expect(sizes.length).toBeGreaterThanOrEqual(4)
    for (const size of sizes) {
      expect(size.width, size.text).toBeGreaterThanOrEqual(44)
      expect(size.height, size.text).toBeGreaterThanOrEqual(44)
    }

    const sheet = await openPhoneMenu(page)
    const close = await sheet.getByRole('button', { name: 'Close' }).boundingBox()
    expect(close?.width).toBeGreaterThanOrEqual(44)
    expect(close?.height).toBeGreaterThanOrEqual(44)
  },
)

test(
  'the phone menu and its Close button are 44 px targets',
  { tag: '@phone' },
  async ({ page }) => {
    await page.goto('/')

    const sheet = await openPhoneMenu(page)
    for (const target of [
      sheet.getByRole('button', { name: 'Close' }),
      ...(await sheet.getByRole('link').all()),
    ]) {
      const box = await target.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }

    await expectNoSeriousViolations(page)
  },
)

test(
  'controls keep the shadcn densities on the desktop project',
  { tag: '@desktop' },
  async ({ page }) => {
    await page.goto('/')

    const refresh = await page.getByRole('button', { name: 'Refresh' }).boundingBox()
    const account = await page.getByRole('button', { name: 'Account menu' }).boundingBox()
    expect(refresh?.height).toBe(36)
    expect(account?.width).toBe(36)
    expect(account?.height).toBe(36)

    await expectNoSeriousViolations(page)
  },
)

test('the theme menu switches to dark and the choice survives a reload', async ({ page }) => {
  await page.goto('/')

  const dark = page.getByRole('menuitemradio', { name: 'Dark' })
  await openMenu(page.getByRole('button', { name: 'Account menu' }), dark)
  await dark.click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expectNoSeriousViolations(page)
})
