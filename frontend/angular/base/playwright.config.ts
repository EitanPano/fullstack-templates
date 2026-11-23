import { defineConfig, devices } from '@playwright/test'

import { e2eDatabaseUrl } from './scripts/e2e-database-url' // @server:database

// @server-start
// Two modes. By default Playwright starts the API and the production build of this app // @noserver:serverless
// (`ng build`, then `scripts/e2e-static.mjs` on the template's port, which serves `dist/` and // @noserver:serverless
// forwards /api to the API), so a journey exercises the real contract on the bundle the image // @noserver:serverless
// serves. With E2E_BASE_URL set (the catalog's case runner does, against the Compose stack) it // @noserver:serverless
// starts nothing and targets that origin. // @noserver:serverless
// Two modes. Beside the API's one Worker this app is one of several frontends and the Worker // @server:serverless
// serves it on its own host. By default Playwright builds this app (`ng build`), then starts the // @server:serverless
// Worker's chain (its e2e database, then its `start --only <dir>`, which assembles this build // @server:serverless
// alone and serves it with the API on one origin) and tests that origin. With E2E_BASE_URL set // @server:serverless
// it starts nothing and targets that origin. // @server:serverless
// @server-end
// @noserver-start
// Two modes. By default Playwright starts the production build of this app (`ng build`, then
// `scripts/e2e-static.mjs` on the template's port, which serves `dist/`), so a journey runs on the
// bundle the image serves. With E2E_BASE_URL set it starts nothing and targets that origin.
// @noserver-end
// A blank value (a CI variable exported empty) counts as unset.
const external = process.env['E2E_BASE_URL']?.trim() || undefined
// The Worker serves each frontend on its own host: Chromium resolves *.localhost itself, while a // @server:serverless
// Node-side request (the `request` fixture of tests/e2e/support.ts) cannot and goes to 127.0.0.1 // @server:serverless
// with the host header set. // @server:serverless
const origin = external ?? 'http://127.0.0.1:__PORT__' // @noserver:serverless
const origin = external ?? 'http://__PACKAGE_DIR__.localhost:__SERVER_PORT__' // @server:serverless
// @server:database-start
// The browser-test database (app_e2e), never the development one. E2E_DATABASE_URL overrides it,
// and anything that is not a *_e2e database is refused when the config loads. Container mode
// starts no API, so it neither reads nor checks the variable.
const databaseUrl = external
  ? ''
  : e2eDatabaseUrl(process.env['E2E_DATABASE_URL'], '__SERVER_E2E_DATABASE_URL__')
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
    // A registered service worker must never serve a stale shell or API answer to a test.
    serviceWorkers: 'block',
  },
  projects: [
    // A test tagged @phone or @desktop belongs to one project; the other project's filter
    // leaves it out, so nothing skips at run time (a skip hides a test from the count).
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
    : [
        // @server-start
        {
          // A fresh API every run (never a leftover one with someone's data), with its limits
          // scaled so the suite does not trip them. Playwright starts web servers before its
          // global setup, so the browser-test database is prepared in the same command, before
          // the API connects to it (the command is empty without a database, so only the start command runs).
          // Beside the Worker one command does it all, from this package's folder: build this app, // @server:serverless
          // go to the Worker's folder and run its chain for this frontend alone (`&&` works in // @server:serverless
          // cmd.exe and in sh alike). // @server:serverless
          command: ['__SERVER_E2E_DB_COMMAND__', '__SERVER_START_COMMAND__'] // @noserver:serverless
          command: [ // @server:serverless
            'bun run build', // @server:serverless
            'cd ../__SERVER_DIR__', // @server:serverless
            '__SERVER_E2E_DB_COMMAND__', // @server:serverless
            '__SERVER_START_COMMAND__ --only __PACKAGE_DIR__', // @server:serverless
          ] // @server:serverless
            .filter(Boolean)
            .join(' && '),
          cwd: '../__SERVER_DIR__', // @noserver:serverless
          url: 'http://127.0.0.1:__SERVER_PORT__/api/health',
          reuseExistingServer: false,
          timeout: 120_000, // @noserver:serverless
          timeout: 300_000, // @server:serverless
          env: {
            RATE_LIMIT_SCALE: '100',
            // @server-end
            // @server:database-start
            E2E_DATABASE_URL: databaseUrl,
            DATABASE_URL: databaseUrl,
            // @server:database-end
            // @server-start
          },
        },
        // @server-end
        // @noserver:serverless-start
        {
          // The production bundle behind a static server that also proxies /api to the API above. // @server
          // The build runs first, so a broken bundle fails here. // @server
          // The production bundle behind a static server. The build runs first, so a broken bundle // @noserver
          // fails here. // @noserver
          command: 'bun run build && node scripts/e2e-static.mjs',
          url: origin,
          reuseExistingServer: false,
          timeout: 300_000,
        },
        // @noserver:serverless-end
      ],
})
