import { expect, test, type APIRequestContext } from '@playwright/test' // @nofrontends
import { expect, type APIRequestContext } from '@playwright/test' // @frontends

import { NOT_FOUND } from './screen-routes'
import {
  collectConsoleProblems,
  cspViolations,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectTouchTargets,
  test, // @frontends
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
// built site is served with its real policy (the page's meta, and beside the API the fixed
// header too), so a violation here is real.
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

// The policy a page's own <meta> holds: its hashed scripts and styles, and the directives of the
// build's configuration (astro.config.mjs).
async function metaPolicy(request: APIRequestContext, path: string): Promise<string> {
  const html = await (await request.get(path)).text()
  return /http-equiv="content-security-policy"[^>]*content="([^"]*)"/i.exec(html)?.[1] ?? ''
}

// @server-start
// Beside the API a page keeps the policy meta its build wrote (its own hashes) and every
// response also carries one fixed header with what a meta cannot carry (frame-ancestors) and the
// rest; a browser applies both. The header has no script or style source, so it never blocks the
// meta's hashes.
test('every page keeps its hashed policy meta and is served with the fixed policy header', async ({
  request,
}) => {
  for (const path of ['/', NOT_FOUND]) {
    const response = await request.get(path)
    const headers = response.headers()
    const header = headers['content-security-policy'] ?? ''

    expect(header, path).toContain("frame-ancestors 'none'")
    expect(header, path).toContain("base-uri 'self'")
    expect(header, path).toContain("object-src 'none'")
    expect(header, path).toContain("form-action 'self'")
    expect(header, path).not.toMatch(/default-src|script-src|style-src/)
    expect(header, path).not.toContain('unsafe-inline')
    expect(headers['x-content-type-options'], path).toBe('nosniff')

    const policy = await metaPolicy(request, path)
    expect(policy, path).toMatch(/script-src 'self' 'sha256-/)
    expect(policy, path).toMatch(/style-src 'self'/)
    expect(policy, path).not.toContain('unsafe-inline')
  }
})
// @server-end
// @noserver-start
// Hosted alone, the policy is the meta Astro writes on every page: a whole policy with hashed
// scripts and styles and no 'unsafe-inline'. A host that can send headers adds frame-ancestors
// (AGENTS.md › Deployment).
test('every page carries a whole hashed policy as a meta tag', async ({ request }) => {
  for (const path of ['/', NOT_FOUND]) {
    const policy = await metaPolicy(request, path)
    expect(policy, path).toContain("default-src 'self'")
    expect(policy, path).toContain("script-src 'self' 'sha256-")
    expect(policy, path).toContain("style-src 'self'")
    expect(policy, path).toContain("object-src 'none'")
    expect(policy, path).not.toContain('unsafe-inline')
  }
})
// @noserver-end
