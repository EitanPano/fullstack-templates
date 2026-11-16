// playwright.config.ts belongs: the e2e run. By default Playwright starts the BUILT site (`bun run
// test:e2e` builds first) on the e2e state: `e2e:db` rebuilds the separate D1 state folder, then
// `start` serves pages and functions on one origin, with rate limits scaled so the suite does not
// trip them. With E2E_BASE_URL set (a blank value counts as unset) nothing is started.
// It does not belong: a test, or anything that reaches the development state.
import { defineConfig, devices } from '@playwright/test'

const PORT = '8788'
const external = process.env.E2E_BASE_URL?.trim() || undefined
const origin = external ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
  },
  projects: [
    // A test tagged @phone or @desktop belongs to one project; the other project's filter leaves
    // it out, so nothing skips at run time (a skip hides a test from the count).
    // Every journey, with its axe scan, on a touch phone.
    { name: 'phone', use: { ...devices['Pixel 7'] }, grepInvert: /@desktop/ },
    // The shell's desktop densities and the desktop screens.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/shell.spec.ts', '**/screens.spec.ts'],
      grepInvert: /@phone/,
    },
  ],
  webServer: external
    ? undefined
    : {
        // A fresh e2e database, then the built site on it (Playwright starts web servers before
        // any global setup, so the two chain here). Never the development state.
        command: 'bun run e2e:db && bun run start',
        url: `${origin}/api/health`,
        reuseExistingServer: false,
        timeout: 180_000,
        env: { PORT, RATE_LIMIT_SCALE: '100' },
      },
})
