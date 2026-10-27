import { defineConfig, devices } from '@playwright/test'

import { externalBaseUrl } from './scripts/e2e-base-url'
import { e2eDatabaseUrl } from './scripts/e2e-database-url' // @server:database

// Two modes. By default Playwright starts the API and the production build of this app, so a
// journey exercises the real contract on the server the image runs. With E2E_BASE_URL set (the
// catalog's case runner does, against the Compose stack) it starts nothing and targets that
// origin.
const external = externalBaseUrl(process.env.E2E_BASE_URL)
const origin = external ?? 'http://127.0.0.1:__PORT__'
// @server:database-start
// The browser-test database (app_e2e), never the development one. E2E_DATABASE_URL overrides it,
// and anything that is not a *_e2e database is refused when the config loads. Container mode
// starts no API, so it neither reads nor checks the variable.
const databaseUrl = external
  ? ''
  : e2eDatabaseUrl(process.env.E2E_DATABASE_URL, '__SERVER_E2E_DATABASE_URL__')
// @server:database-end

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
    // Every journey, with its axe scan, on a touch phone; not the checks tagged @desktop.
    { name: 'phone', use: { ...devices['Pixel 7'] }, grepInvert: /@desktop/ },
    // The shell's desktop densities and the desktop screens; not the checks tagged @phone.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/shell.spec.ts', '**/screens.spec.ts'],
      grepInvert: /@phone/,
    },
  ],
  webServer: external
    ? undefined
    : [
        {
          // A fresh API every run (never a leftover one with someone's data), with its limits
          // scaled so the suite does not trip them. Playwright starts web servers before its
          // global setup, so the browser-test database is prepared in the same command, before
          // the API connects to it.
          command: '__SERVER_E2E_DB_COMMAND__ && __SERVER_START_COMMAND__', // @server:database
          command: '__SERVER_START_COMMAND__', // @noserver:database
          cwd: '../__SERVER_DIR__',
          url: 'http://127.0.0.1:__SERVER_PORT__/api/health',
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            RATE_LIMIT_SCALE: '100',
            // @server:database-start
            E2E_DATABASE_URL: databaseUrl,
            DATABASE_URL: databaseUrl,
            // @server:database-end
          },
        },
        {
          // Builds, then serves .next/standalone; see scripts/e2e-server.mjs.
          command: 'node scripts/e2e-server.mjs',
          url: origin,
          reuseExistingServer: false,
          timeout: 300_000,
          env: {
            API_URL: 'http://127.0.0.1:__SERVER_PORT__',
            PORT: '__PORT__',
            HOSTNAME: '127.0.0.1',
          },
        },
      ],
})
