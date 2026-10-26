import { mkdirSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { NAV } from '../../src/app/nav'

// The screens QA reads: every route of the nav table, plus the auth screens when the server has
// auth, in the project's viewport and in both themes. The theme is the one next-themes stores,
// set before the page loads, so it holds whatever the brand's default theme is.
const ROUTES = [
  ...NAV.map((entry) => entry.href),
  '/sign-in', // @server:auth
  '/sign-up', // @server:auth
]
const THEMES = ['light', 'dark'] as const
const DIRECTORY = 'test-results/screens'

function slug(route: string): string {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')
}

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`${route} in ${theme}`, async ({ page }, info) => {
      await page.addInitScript((value) => {
        localStorage.setItem('theme', value)
      }, theme)
      await page.goto(route)
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts.ready)

      mkdirSync(DIRECTORY, { recursive: true })
      await page.screenshot({
        path: `${DIRECTORY}/${slug(route)}-${info.project.name}-${theme}.png`,
        fullPage: true,
      })
    })
  }
}
