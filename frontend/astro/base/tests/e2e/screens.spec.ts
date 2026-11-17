import { mkdirSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { capturedRoutes } from './screen-routes'
import { cspViolations, screenProblems, setTheme, watchCspViolations } from './support'

// The screens QA reads: every route of the nav table and the 404 page, in the project's viewport
// and in both themes. The theme is stored before the page loads (the key theme-init.js reads), so
// it holds whatever the brand's default theme is. Each screen is also checked: no WCAG A/AA axe
// violation, no sideways scroll, exactly one h1 and no Content-Security-Policy violation.
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
  const problems = await screenProblems(page)
  for (const violation of await cspViolations(page)) problems.push('csp violation: ' + violation)
  return problems
}

for (const route of capturedRoutes()) {
  for (const theme of THEMES) {
    test(`${route} in ${theme}`, async ({ page }, info) => {
      await setTheme(page, theme)
      await watchCspViolations(page)

      const problems = await capture(page, route, theme)

      expect(problems, `${route} (${theme}, ${info.project.name})`).toEqual([])
    })
  }
}
