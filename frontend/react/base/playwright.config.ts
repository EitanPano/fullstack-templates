import { defineConfig, devices } from '@playwright/test'

// With E2E_BASE_URL set (a built container, a deployed stack) the tests hit that URL and no
// web server starts. Otherwise this starts the API as well as the dev server, so a journey
// test exercises the real contract through the /api proxy.
const external = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: external ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'], screenshot: 'on' } },
  ],
  webServer: external
    ? undefined
    : [
        {
          command: '__SERVER_DEV_COMMAND__',
          cwd: '../__SERVER_DIR__',
          url: 'http://localhost:__SERVER_PORT__/api/health',
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: 'bun run dev',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
})
