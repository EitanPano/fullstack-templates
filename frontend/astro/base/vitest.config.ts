// vitest.config.ts belongs: the unit project. It runs in Node (a file that needs a DOM starts with
// `// @vitest-environment jsdom`) and is built from Astro's own Vite config, so a kit component
// renders through Astro's container API.
// It does not belong: the e2e run (playwright.config.ts) or the build.
import { getViteConfig } from 'astro/config'
import type {} from 'vitest/config'

export default getViteConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // A test that stubs a global gets the real one back without remembering to unstub it.
    unstubGlobals: true,
    allowOnly: false,
    passWithNoTests: false,
  },
})
