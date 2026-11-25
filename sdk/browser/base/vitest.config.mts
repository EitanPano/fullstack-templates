import { defineConfig } from 'vitest/config'

import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
    __SDK_API_ORIGIN__: JSON.stringify(''),
  },
  test: {
    environment: 'jsdom',
    globals: false,
    unstubGlobals: true,
    restoreMocks: true,
    include: ['tests/unit/**/*.test.ts'],
    allowOnly: false,
    passWithNoTests: false,
  },
})
