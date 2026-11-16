// vitest.config.ts belongs: the two test projects. `unit` runs in Node (pure code, the page
// modules, the lint boundaries, the config files, and every kit component through Astro's
// container, which is why its config comes from `getViteConfig`); `api` runs in workerd (the
// platform's real routing against a D1 with the migrations applied; `bun run test:db` runs it alone).
// It does not belong: test code (tests/) or the build.
import path from 'node:path'

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { getViteConfig } from 'astro/config'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname
const alias = { '@shared': path.join(root, 'shared') }

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(root, 'migrations'))
  const unit = await getViteConfig({
    resolve: { alias },
    test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
  })({ command: 'serve', mode: 'test' })
  return {
    test: {
      projects: [
        unit,
        {
          resolve: { alias },
          plugins: [
            cloudflareTest({
              // Built once per run by the global setup: every function and the middleware.
              main: './dist-functions/index.js',
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: {
                bindings: {
                  ENVIRONMENT: 'test',
                  TEST_MIGRATIONS: migrations,
                },
              },
            }),
          ],
          test: {
            name: 'api',
            include: ['tests/api/**/*.test.ts'],
            globalSetup: ['./tests/api/global-setup.ts'],
            setupFiles: ['./tests/api/setup.ts'],
          },
        },
      ],
    },
  }
})
