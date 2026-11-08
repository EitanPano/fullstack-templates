import { mkdirSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

// @server:auth-start
import { e2eDatabaseUrl } from '../../scripts/e2e-database-url' // @server:database
import { fillSignIn, registerThroughUi, signOutThroughUi } from './auth-support'
// @server:auth-end
import { capturedRoutes } from './screen-routes'
import { SIGNED_IN_ROUTES, type SetupAccount } from './screen-routes' // @server:auth
import { screenProblems, setTheme } from './support'

// The screens QA reads: every route of the nav table, plus the auth screens when the server has
// auth, in the project's viewport and in both themes. The theme is stored before the page loads
// (the JSON-encoded key theme-init.js and the theme store read), so it holds whatever the brand's default
// theme is. Each screen is also checked: no WCAG A/AA axe violation, no sideways scroll, exactly
// one h1. A route also in SIGNED_IN_ROUTES is captured only signed in.
const THEMES = ['light', 'dark'] as const
type Theme = (typeof THEMES)[number]
const DIRECTORY = 'test-results/screens'

function slug(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')
}

// Opens the route in the theme, saves the screenshot and returns what the checks found.
async function capture(page: Page, route: string, theme: Theme): Promise<string[]> {
  await page.goto(route)
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)

  mkdirSync(DIRECTORY, { recursive: true })
  await page.screenshot({
    path: `${DIRECTORY}/${slug(route)}-${test.info().project.name}-${theme}.png`,
    fullPage: true,
  })
  return screenProblems(page)
}

for (const route of capturedRoutes()) {
  for (const theme of THEMES) {
    test(`${route} in ${theme}`, async ({ page }, info) => {
      await setTheme(page, theme)

      const problems = await capture(page, route, theme)

      expect(problems, `${route} (${theme}, ${info.project.name})`).toEqual([])
    })
  }
}

// @server:auth-start
// True when E2E_BASE_URL points the suite at a running stack, whose database is not the browser-test
// one. A blank value counts as unset (as in playwright.config.ts).
const EXTERNAL = Boolean(process.env.E2E_BASE_URL?.trim())

// Defence in depth: the groups below already leave every setup out when EXTERNAL.
// The account is built field by field so the file is valid TypeScript with or without a database.
function setupAccount(email: string): SetupAccount {
  if (EXTERNAL) {
    throw new Error('A role setup needs the suite to start its own API; E2E_BASE_URL is set')
  }
  const account: Partial<SetupAccount> = { email }
  account.databaseUrl = e2eDatabaseUrl(process.env.E2E_DATABASE_URL, '__SERVER_E2E_DATABASE_URL__') // @server:database
  return account as SetupAccount
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
const HASHED = { timeout: 15_000 } // the wait after a submit that hashes a password
const REGISTRATION_MS = HASHED.timeout
const MARGIN_MS = 15_000
const CAPTURE_MS = 10_000

for (const group of groups) {
  test(`signed-in ${group.map((entry) => entry.route).join(', ')}`, async ({ page }, info) => {
    const setup = group[0]?.setup
    test.setTimeout(
      REGISTRATION_MS * (setup ? 2 : 1) + MARGIN_MS + group.length * THEMES.length * CAPTURE_MS,
    )
    const email = await registerThroughUi(page, 'screens')
    if (setup) {
      await setup(setupAccount(email))
      // The role is a claim in the session's token, so the session the registration made still
      // has the old one: sign in again to capture as the promoted account.
      await signOutThroughUi(page, email)
      await page.goto('/auth/login')
      await fillSignIn(page, email)
      await expect(page).toHaveURL(/\/$/, HASHED)
    }

    const problems: string[] = []
    for (const { route } of group) {
      for (const theme of THEMES) {
        await page.evaluate((value) => {
          localStorage.setItem('theme', JSON.stringify(value))
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
