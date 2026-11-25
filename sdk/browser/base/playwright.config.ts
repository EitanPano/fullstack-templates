import { resolve } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import {
  API_ORIGIN,
  API_PORT,
  LISTED_ORIGIN,
  LISTED_PORT,
  SDK_KEY,
  UNLISTED_PORT,
} from './tests/e2e/hosts'

// A guest behaves differently in each engine (ADR 0020 F4), so every spec runs in all three.
// Playwright starts, fresh each run: the API from the server package, serving the test build of
// the SDK (the fixture module, written by `build:e2e`) from SDK_DIR, and two host fixture
// servers on another site than the API. The API lists the first host for the key, not the second.
// @server:database-start
// The browser-test database (app_e2e), never the development one. E2E_DATABASE_URL overrides it,
// and anything that is not a *_e2e database is refused when the config loads.
function e2eDatabaseUrl(configured: string | undefined, fallback: string): string {
  const url = configured?.trim() || fallback
  let name: string
  try {
    name = new URL(url).pathname.replace(/^\//, '')
  } catch {
    name = '(not a URL)'
  }
  if (!name.endsWith('_e2e')) {
    throw new Error(`E2E_DATABASE_URL must name a database ending in _e2e, not "${name}"`)
  }
  return url
}
const databaseUrl = e2eDatabaseUrl(process.env.E2E_DATABASE_URL, '__SERVER_E2E_DATABASE_URL__')
// @server:database-end

const host = (port: number) =>
  `node tests/e2e/host-server.mjs ${port} ${API_ORIGIN} ${LISTED_ORIGIN} ${SDK_KEY}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // The cap keeps WebKit's browser process alive on a laptop: with a worker per core it was seen to
  // drop its connection mid-run ("Target page, context or browser has been closed").
  workers: 6,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      // A fresh API every run, with its limits scaled so the suite does not trip them. Playwright
      // starts web servers before any global setup, so the browser-test database is prepared in
      // the same command, before the API connects to it.
      command: '__SERVER_E2E_DB_COMMAND__ && __SERVER_START_COMMAND__', // @server:database
      command: '__SERVER_START_COMMAND__', // @noserver:database
      cwd: '../__SERVER_DIR__',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        RATE_LIMIT_SCALE: '100',
        SDK_KEYS: `${SDK_KEY}=${LISTED_ORIGIN}`,
        SDK_DIR: resolve(import.meta.dirname, 'tests/e2e/.build/cdn'),
        SDK_ENABLED: 'true',
        E2E_DATABASE_URL: databaseUrl, // @server:database
        DATABASE_URL: databaseUrl, // @server:database
      },
    },
    {
      command: host(LISTED_PORT),
      url: `${LISTED_ORIGIN}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: host(UNLISTED_PORT),
      url: `http://127.0.0.1:${UNLISTED_PORT}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
