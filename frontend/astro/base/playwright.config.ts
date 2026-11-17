// playwright.config.ts belongs: the e2e run. `bun run test:e2e` builds the site, then Playwright
// serves it. A test tagged @phone or @desktop belongs to one project; the other project's filter
// leaves it out, so nothing skips at run time (a skip hides a test from the count).
// It does not belong: a test, or anything that reaches a development database.
import { defineConfig, devices } from '@playwright/test'

// @server-start
// Two modes. By default Playwright starts the server package's own chain (its e2e database, then
// its `start`, which assembles this build with the functions and serves both on one origin) with
// its limits scaled so the suite does not trip them, and tests that origin. With E2E_BASE_URL set
// nothing is started.
// @server-end
// @noserver-start
// Two modes. By default Playwright serves the built site (`astro preview`) on the template's port
// and tests it. With E2E_BASE_URL set nothing is started.
// @noserver-end
// A blank value (a CI variable exported empty) counts as unset.
const external = process.env.E2E_BASE_URL?.trim() || undefined
const origin = external ?? 'http://127.0.0.1:__PORT__' // @noserver
const origin = external ?? 'http://127.0.0.1:__SERVER_PORT__' // @server

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
        // @server-start
        // Playwright starts web servers before any global setup, so the e2e database and the
        // server are one command, run in the server's directory. The pages are assembled from
        // dist/, which `bun run test:e2e` built first.
        command: ['__SERVER_E2E_DB_COMMAND__', '__SERVER_START_COMMAND__']
          .filter(Boolean)
          .join(' && '),
        cwd: '../__SERVER_DIR__',
        url: `${origin}/api/health`,
        env: { RATE_LIMIT_SCALE: '100' },
        // @server-end
        // @noserver-start
        command: 'bun run preview',
        url: origin,
        // @noserver-end
        reuseExistingServer: false,
        timeout: 180_000,
      },
})
