import { expect, test, type Page } from '@playwright/test'

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  isPhone,
} from './support'

// Below lg the navigation is a drawer behind the header's toggle; from lg it is a column.
async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
}

test('the page has the shell landmarks', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('header')).toHaveCount(1)
  await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(1)
  await expect(page.locator('main#main')).toHaveCount(1)
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('footer')).toHaveCount(1)
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  if (isPhone(test.info().project.name)) await openDrawer(page)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()

  await expectNoAxeViolations(page)
})

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
  await page.goto('/no/such/page')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.locator('main#main')).toBeFocused()
  expect(new URL(page.url()).pathname).toBe('/no/such/page')
})

for (const path of ['/', '/no/such/page']) {
  test(`${path} has no horizontal overflow`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await expectNoAxeViolations(page)
  })
}

test('an unknown URL renders not-found inside the shell', async ({ page }) => {
  await page.goto('/no/such/page')

  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
})

test('every control is a 44 px touch target', { tag: '@phone' }, async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await expectTouchTargets(page, 44)
  await openDrawer(page)
  await expectTouchTargets(page, 44)
  await expectNoAxeViolations(page)
})

// `data-density="compact"` is a generation setting; setting it here exercises the same CSS
// without a second build. Compact tightens spacing and never shrinks a touch target.
test(
  'compact density does not shrink a touch target on the phone project',
  { tag: '@phone' },
  async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })

    await expectTouchTargets(page, 44)
    await openDrawer(page)
    await expectTouchTargets(page, 44)
  },
)

test(
  'compact density tightens spacing and keeps the controls on the desktop project',
  { tag: '@desktop' },
  async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const metrics = () =>
      page.evaluate(() => {
        const main = document.querySelector('main#main')
        const refresh = [...document.querySelectorAll('button')].find(
          (button) => button.textContent.trim() === 'Refresh',
        )
        return {
          fontSize: getComputedStyle(document.body).fontSize,
          mainPadding: main ? parseFloat(getComputedStyle(main).paddingBlockStart) : 0,
          refreshHeight: refresh?.getBoundingClientRect().height ?? 0,
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
    expect(compact.mainPadding).toBeLessThan(comfortable.mainPadding)
    // A desktop control keeps its 40 px height in both densities.
    expect(comfortable.refreshHeight).toBe(40)
    expect(compact.refreshHeight).toBe(40)

    await expectNoAxeViolations(page)
  },
)

test('the theme toggle switches to dark and the choice survives a reload', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')

  // Cycle (light, dark, system) until dark, whatever theme was generated as the default. After
  // each click wait for the stored choice to change: reading the page earlier sees the old state
  // and clicks past dark.
  const toggle = page.getByRole('button', { name: /^Theme:/ })
  const stored = () => page.evaluate(() => localStorage.getItem('theme'))
  const isDark = async () => /^Theme: Dark\./.test((await toggle.getAttribute('aria-label')) ?? '')
  await expect(toggle).toBeVisible()
  for (let step = 0; step < 3 && !(await isDark()); step++) {
    const before = await stored()
    await toggle.click()
    await expect.poll(stored).not.toBe(before)
    // The label follows the signal; wait for it so the next read is not of the old state.
    const choice = JSON.parse((await stored()) ?? '"system"') as string
    await expect(toggle).toHaveAttribute(
      'aria-label',
      new RegExp(`^Theme: ${choice[0].toUpperCase()}${choice.slice(1)}[.]`),
    )
  }
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect.poll(stored).toBe('"dark"')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expectNoAxeViolations(page)
})

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
