import { mkdirSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { externalBaseUrl } from '../../scripts/e2e-base-url' // @server:auth
import { NAV } from '../../src/app/nav'

import { fillSignIn, HASHED, registerThroughUi, signOutThroughUi } from './auth-support' // @server:auth
import { capturedRoutes } from './screen-routes'
import { screenProblems } from './support'

// @server:auth-start
// True when E2E_BASE_URL points the suite at a running stack, whose database is not the browser-test
// one. A blank value counts as unset (as in playwright.config.ts).
const EXTERNAL = Boolean(externalBaseUrl(process.env.E2E_BASE_URL))

// What a role setup receives: the account just registered and the URL of the browser-test
// database. Without a database there is nothing to promote, so a setup receives `never`.
type SetupAccount = { email: string; databaseUrl: string } // @server:database
type SetupAccount = never // @noserver:database

// The screens only an account sees, captured after signing up through the form. An entry with a
// `setup` is for a role-gated route: the project writes the function in its own e2e support file
// (promote `account.email` to the role the route needs) and gets its own account. A setup acts
// only on `account.databaseUrl`, which is checked to end in `_e2e` (the database the e2e chain
// prepares) and is never read from anywhere else; it is refused when `E2E_BASE_URL` points the
// suite at a running stack, whose database is not the browser-test one.
const SIGNED_IN_ROUTES: { route: string; setup?: (account: SetupAccount) => Promise<void> }[] = [
  { route: '/profile' },
  { route: '/forbidden' },
]

// @server:auth-end

// The screens QA reads: every route of the nav table, plus the auth screens when the server has
// auth, in the project's viewport and in both themes. The theme is the one next-themes stores,
// set before the page loads, so it holds whatever the brand's default theme is. Each screen is
// also checked: no WCAG A/AA axe violation, no sideways scroll, exactly one h1.
// A route also in SIGNED_IN_ROUTES is captured only signed in: signed out it would be the sign-in
// redirect, written to the same file name.
const SIGNED_IN: string[] = SIGNED_IN_ROUTES.map((entry) => entry.route) // @server:auth
const SIGNED_IN: string[] = [] // @noserver:auth
const ROUTES = [
  ...capturedRoutes(
    NAV.map((entry) => entry.href),
    SIGNED_IN,
  ),
  '/sign-in', // @server:auth
  '/sign-up', // @server:auth
]
const THEMES = ['light', 'dark'] as const
type Theme = (typeof THEMES)[number]
const DIRECTORY = 'test-results/screens'

function slug(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')
}

// Opens the route in the theme, saves the screenshot and returns what the checks found.
async function capture(page: Page, route: string, theme: Theme): Promise<string[]> {
  await page.goto(route)
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)

  mkdirSync(DIRECTORY, { recursive: true })
  await page.screenshot({
    path: `${DIRECTORY}/${slug(route)}-${test.info().project.name}-${theme}.png`,
    fullPage: true,
  })
  return screenProblems(page)
}

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`${route} in ${theme}`, async ({ page }, info) => {
      await page.addInitScript((value) => {
        localStorage.setItem('theme', value)
      }, theme)

      const problems = await capture(page, route, theme)

      expect(problems, `${route} (${theme}, ${info.project.name})`).toEqual([])
    })
  }
}

// @server:auth-start
// Defence in depth: the groups below already leave every setup out when EXTERNAL.
async function setupAccount(email: string): Promise<SetupAccount> { // @server:database
function setupAccount(email: string): Promise<SetupAccount> { // @noserver:database
  if (EXTERNAL) {
    throw new Error('A role setup needs the suite to start its own API; E2E_BASE_URL is set')
  }
  const { e2eDatabaseUrl } = await import('../../scripts/e2e-database-url') // @server:database
  const fallback = '__SERVER_E2E_DATABASE_URL__' // @server:database
  const databaseUrl = e2eDatabaseUrl(process.env.E2E_DATABASE_URL, fallback) // @server:database
  return { email, databaseUrl } // @server:database
  throw new Error(`No database, so nothing to promote for ${email}`) // @noserver:database
}

// Entries without a setup share one account (the register route is rate limited); each with a
// setup has its own. Against a running stack (E2E_BASE_URL) the setup groups are left out when the
// tests are collected, so no registration is spent: the one exclusion of container-mode e2e.
const groups = [
  SIGNED_IN_ROUTES.filter((entry) => !entry.setup),
  ...(EXTERNAL ? [] : SIGNED_IN_ROUTES.filter((entry) => entry.setup).map((entry) => [entry])),
].filter((group) => group.length > 0)

// The signed-in test is one test per project, so its timeout grows with the work: a registration
// (HASHED, and a second sign-in after a setup), a fixed margin for the menu and navigation, and a
// budget per capture (goto, networkidle, screenshot, axe).
const REGISTRATION_MS = HASHED.timeout
const MARGIN_MS = 15_000
const CAPTURE_MS = 10_000

for (const group of groups) {
  test(`signed-in ${group.map((entry) => entry.route).join(', ')}`, async ({ page }, info) => {
    const setup = group[0]?.setup
    test.setTimeout(
      REGISTRATION_MS * (setup ? 2 : 1) + MARGIN_MS + group.length * THEMES.length * CAPTURE_MS,
    )
    const email = await registerThroughUi(page)
    if (setup) {
      await setup(await setupAccount(email))
      // The role is a claim in the session's token, so the session the registration made still
      // has the old one: sign in again to capture as the promoted account.
      await signOutThroughUi(page, email)
      await fillSignIn(page, email)
      await expect(page).toHaveURL(/\/$/, HASHED)
    }

    const problems: string[] = []
    for (const { route } of group) {
      for (const theme of THEMES) {
        await page.evaluate((value) => {
          localStorage.setItem('theme', value)
        }, theme)
        for (const problem of await capture(page, route, theme)) {
          problems.push(`${route} (${theme}): ${problem}`)
        }
      }
    }

    expect(problems, `signed-in screens (${info.project.name})`).toEqual([])
  })
}
// @server:auth-end
