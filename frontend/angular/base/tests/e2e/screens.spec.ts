import { mkdirSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { signupThroughApi } from './auth-support' // @server:auth
import { capturedRoutes } from './screen-routes'
import { SIGNED_IN_ROUTES } from './screen-routes' // @server:auth
import { screenProblems, setTheme } from './support'

// The screens QA reads: every route of the nav table, plus the auth screens when the server has
// auth, in the project's viewport and in both themes. The theme is stored before the page loads
// (as ThemeService writes it), so it holds whatever the brand's default theme is. Each screen is
// also checked: no WCAG A/AA axe violation, no sideways scroll, exactly one h1.
// A route also in SIGNED_IN_ROUTES is captured only signed in: signed out it would be the sign-in
// redirect, written to the same file name.
const THEMES = ['light', 'dark'] as const
type Theme = (typeof THEMES)[number]
const DIRECTORY = 'test-results/screens'

function slug(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')
}

// Opens the route in the theme, saves the screenshot and returns what the checks found.
async function capture(page: Page, route: string, theme: Theme): Promise<string[]> {
  await setTheme(page, theme)
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
      const problems = await capture(page, route, theme)

      expect(problems, `${route} (${theme}, ${info.project.name})`).toEqual([])
    })
  }
}

// @server:auth-start
// The signed-in test is one test per project, so its timeout grows with the work: a registration
// (the password is hashed), a fixed margin, and a budget per capture (goto, networkidle,
// screenshot, axe).
const REGISTRATION_MS = 15_000
const MARGIN_MS = 15_000
const CAPTURE_MS = 10_000

test('the signed-in screens', async ({ page }, info) => {
  test.setTimeout(
    REGISTRATION_MS + MARGIN_MS + SIGNED_IN_ROUTES.length * THEMES.length * CAPTURE_MS,
  )
  await signupThroughApi(page, 'screens')

  const problems: string[] = []
  for (const route of SIGNED_IN_ROUTES) {
    for (const theme of THEMES) {
      for (const problem of await capture(page, route, theme)) {
        problems.push(`${route} (${theme}): ${problem}`)
      }
    }
  }

  expect(problems, `signed-in screens (${info.project.name})`).toEqual([])
})
// @server:auth-end
