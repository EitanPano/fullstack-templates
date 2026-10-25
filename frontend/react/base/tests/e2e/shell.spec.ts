import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
}

test('the shell has its landmarks and a working skip link', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()

  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  const skipBox = await skip.boundingBox()
  expect(skipBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  await skip.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()

  expect(await seriousViolations(page)).toEqual([])
})

test('nothing overflows the viewport', async ({ page }) => {
  for (const path of ['/', '/no/such/page']) {
    await page.goto(path)
    await expect(page.getByRole('main')).toBeVisible()
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(fits, `${path} overflows horizontally`).toBe(true)
  }

  expect(await seriousViolations(page)).toEqual([])
})

test('touch targets are at least 44 px', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()

  const targets = page.locator('button, nav a, header a')
  const boxes = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const { height, width } = element.getBoundingClientRect()
      const inNav = element.closest('nav') !== null
      const brand = !inNav && element.closest('header') !== null
      return { label: element.textContent, inNav, brand, height, width }
    }),
  )
  // The set must include a nav link and the brand (a header link outside the nav).
  expect(boxes.some((box) => box.inNav)).toBe(true)
  expect(boxes.some((box) => box.brand)).toBe(true)
  for (const box of boxes) {
    expect(box.height, box.label).toBeGreaterThanOrEqual(44)
    expect(box.width, box.label).toBeGreaterThanOrEqual(44)
  }

  expect(await seriousViolations(page)).toEqual([])
})
