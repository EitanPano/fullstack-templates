import { expect, test, type Page } from '@playwright/test'

import {
  collectConsoleProblems,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  isPhone,
  settled,
} from './support'

// Below lg the navigation is a drawer behind the header's toggle; from lg it is a column.
async function openDrawer(page: Page) {
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const drawer = page.getByRole('dialog', { name: 'Menu' })
  await expect(drawer).toBeVisible()
  await settled(drawer)
  return drawer
}

test('the page has the shell landmarks', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('header')).toHaveCount(1)
  await expect(page.locator('main#main')).toHaveCount(1)
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('footer')).toHaveCount(1)
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
  // The one nav table renders once: inline from lg, inside the drawer below it (the drawer's
  // content is not in the document while it is closed).
  if (isPhone(test.info().project.name)) await openDrawer(page)
  await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(1)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()

  await expectNoAxeViolations(page)
})

test('the header names the product and links home', async ({ page }) => {
  await page.goto('/no/such/page')

  await page.getByRole('banner').getByRole('link').first().click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'System status' })).toBeVisible()
})

test('the skip link is first in the tab order and moves focus to main', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()

  await expectNoAxeViolations(page)
})

test('the skip link works on a nested screen too', async ({ page }) => {
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

test('the page logs no console error or warning', async ({ page }) => {
  const problems = collectConsoleProblems(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'System status' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.goto('/no/such/page')
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()

  expect(problems).toEqual([])
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
  'controls keep the desktop densities on the desktop project',
  { tag: '@desktop' },
  async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // The generated density is not the test's business: clear it for the comfortable sizes, then
    // set compact. Polled because the control sizes animate.
    const size = (name: string | RegExp, dimension: 'width' | 'height') => async () =>
      (await page.getByRole('button', { name }).boundingBox())?.[dimension]

    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-density')
    })
    await expect.poll(size('Refresh', 'height')).toBe(36)
    await expect.poll(size(/^Theme:/, 'width')).toBe(36)
    await expect.poll(size(/^Theme:/, 'height')).toBe(36)

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-density', 'compact')
    })
    await expect.poll(size('Refresh', 'height')).toBe(32)
    await expect.poll(size(/^Theme:/, 'width')).toBe(32)
    await expect.poll(size(/^Theme:/, 'height')).toBe(32)

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
    const choice = JSON.parse((await stored()) ?? '"system"') as string
    await expect(toggle).toHaveAttribute(
      'aria-label',
      new RegExp(`^Theme: ${choice[0]?.toUpperCase() ?? ''}${choice.slice(1)}[.]`),
    )
  }
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect.poll(stored).toBe('"dark"')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expectNoAxeViolations(page)
})

test(
  'the drawer traps focus, closes on Escape and gives focus back',
  { tag: '@phone' },
  async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const toggle = page.getByRole('button', { name: 'Open navigation' })

    const drawer = await openDrawer(page)
    await expect(page.locator('main')).toHaveAttribute('inert', '')

    // Tab never leaves the drawer: after more presses than it has controls, focus is still in it.
    for (let press = 0; press < 6; press++) await page.keyboard.press('Tab')
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true)

    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(toggle).toBeFocused()
    await expect(page.locator('main')).not.toHaveAttribute('inert', '')
  },
)

// @i18n-start
test('the language toggle flips the direction and the choice survives a reload', async ({
  page,
}) => {
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('lang', 'en')
  // English is the document's default direction: the attribute is set only by a language switch.
  await expect(html).not.toHaveAttribute('dir', 'rtl')

  await page.getByRole('button', { name: 'Switch language to עברית' }).click()
  await expect(html).toHaveAttribute('lang', 'he')
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expectNoHorizontalOverflow(page)
  await expectNoAxeViolations(page)

  await page.reload()
  await expect(html).toHaveAttribute('dir', 'rtl')

  // The page is Hebrew now, so the button's name is in Hebrew: find it by its class.
  await page.locator('.header__language').click()
  await expect(html).toHaveAttribute('dir', 'ltr')
})
// @i18n-end

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

// `vite preview` sets no CSP, so this adds the deployed one (`script-src 'self'`, no eval) to the
// document and proves the bundle runs under it: the copy tables are precompiled, so vue-i18n
// never compiles a message at run time. The probe is a same-origin script file, because
// `page.evaluate` bypasses the page's CSP; it shows that eval is really blocked.
test('the bundle runs under a CSP that forbids eval', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.resourceType() === 'document') {
      const response = await route.fetch()
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy':
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'",
        },
      })
      return
    }
    if (new URL(request.url()).pathname === '/eval-probe.js') {
      await route.fulfill({
        contentType: 'text/javascript',
        body: "try { eval('1'); window.evalBlocked = false } catch { window.evalBlocked = true }",
      })
      return
    }
    await route.continue()
  })
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { cspViolations: violations })
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'System status' })).toBeVisible()
  await expect(
    page.locator('.health-status__fact', { hasText: 'Status' }).locator('dd'),
  ).toHaveText('Operational')

  // No violation so far: nothing in the bundle (zod's parser probe included) tried to evaluate code.
  expect(
    await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations),
  ).toEqual([])

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const script = document.createElement('script')
        script.src = '/eval-probe.js'
        script.onload = () => {
          resolve()
        }
        document.head.append(script)
      }),
  )
  expect(
    await page.evaluate(() => (window as unknown as { evalBlocked: boolean }).evalBlocked),
  ).toBe(true)
})
