import { expect, test } from '@playwright/test'

import { collectConsoleProblems } from './support'

// What the production bundle must do whatever the screens: log nothing, ship the theme script as a
// file, and run under the deployed Content Security Policy.

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
  await page.goto('/auth/register')
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
  await page.getByLabel('Email').fill('not an email')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Enter a valid email address')).toBeVisible()
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
