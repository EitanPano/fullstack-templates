import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // @pwa-start
      // The plugin's virtual module has no worker under Vitest; a stand-in answers instead.
      'virtual:pwa-register/vue': fileURLToPath(
        new URL('./src/testing/pwa-register.stub.ts', import.meta.url),
      ),
      // @pwa-end
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    // A test that stubs fetch gets the real one back without remembering to unstub it.
    unstubGlobals: true,
    include: ['src/**/*.spec.ts', 'tests/unit/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    allowOnly: false,
    passWithNoTests: false,
  },
})
