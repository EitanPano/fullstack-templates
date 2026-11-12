import { expect, test } from '@playwright/test'

import {
  collectConsoleProblems,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectTouchTargets,
} from './support'

// The 404 is the template's one screen with a control, so the control checks run on it.
const NOT_FOUND = '/no/such/page'
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

test('an unknown URL renders not-found inside main', async ({ page }) => {
  await page.goto(NOT_FOUND)

  await expect(page.locator('main')).toHaveCount(1)
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible()
})

// The layout is a column at least the viewport high with `main` taking the rest, so a full-bleed
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

// @i18n-start
// The language toggle is on no page of the template, so the click cannot be driven end to end.
// This stores the Hebrew choice the way the language store persists it (the JSON-encoded key, as
// screens.spec does for the theme), before the page loads, and checks the layout holds in RTL.
test('a stored Hebrew choice is applied on load: rtl, no overflow, no axe violation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('lang', JSON.stringify('he'))
  })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('lang', 'he')
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await expectNoHorizontalOverflow(page)
  await expectNoAxeViolations(page)
})
// @i18n-end

test('the page logs no console error or warning', async ({ page }) => {
  const problems = collectConsoleProblems(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.goto('/no/such/page')
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()

  expect(problems).toEqual([])
})

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
  await expect(
    page.getByRole('heading', { level: 1, name: '__PROJECT_DISPLAY_NAME__' }),
  ).toBeVisible()
  // @server:auth-start
  // The form's first parse runs zod, which probes `new Function('')` unless it runs jitless.
  await page.goto('/auth/signup')
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
  await page.getByLabel('Email').fill('csp@example.com')
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByLabel('Confirm password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Enter at least 8 characters')).toBeVisible()
  // @server:auth-end

  // No violation so far: nothing in the bundle tried to evaluate code.
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
