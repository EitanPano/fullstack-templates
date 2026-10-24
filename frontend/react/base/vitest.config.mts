import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    allowOnly: false,
    passWithNoTests: false,
  },
})
