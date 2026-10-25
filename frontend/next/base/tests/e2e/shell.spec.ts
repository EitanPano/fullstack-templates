import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(serious).toEqual([])
}

test('the page has the shell landmarks', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()

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

for (const path of ['/', '/no/such/page']) {
  test(`buttons and nav links on ${path} are at least 44 by 44 px`, async ({ page }) => {
    await page.goto(path)

    // A locator pierces open shadow roots, so the dev server's overlay (hosted by
    // <nextjs-portal>) shows up here; it is not product UI, so the callback skips it.
    const sizes = await page.locator('button, nav a, header a').evaluateAll((elements) =>
      elements.flatMap((element) => {
        const root = element.getRootNode()
        if (root instanceof ShadowRoot && root.host.tagName === 'NEXTJS-PORTAL') return []
        const { width, height } = element.getBoundingClientRect()
        const inNav = element.closest('nav') !== null
        const brand = !inNav && element.closest('header') !== null
        return [{ text: element.textContent, inNav, brand, width, height }]
      }),
    )
    // The set must include a nav link and the brand (a header link outside the nav).
    expect(sizes.some((size) => size.inNav)).toBe(true)
    expect(sizes.some((size) => size.brand)).toBe(true)
    for (const size of sizes) {
      expect(size.width, size.text).toBeGreaterThanOrEqual(44)
      expect(size.height, size.text).toBeGreaterThanOrEqual(44)
    }

    await expectNoSeriousViolations(page)
  })
}
