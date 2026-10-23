import { defineConfig, devices } from '@playwright/test'

// Starts the API as well as the frontend, so a journey test exercises the real contract.
// The server needs no database to answer /api/health; a journey that reads or writes
// data starts whatever infrastructure docker-compose.yml defines for it.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: '__SERVER_DEV_COMMAND__',
      cwd: '../__SERVER_DIR__',
      url: 'http://localhost:__SERVER_PORT__/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'bun run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
