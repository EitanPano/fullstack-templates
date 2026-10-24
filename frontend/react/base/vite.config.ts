import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser always calls relative /api on its own origin. In development the dev server
// forwards it to the API; changeOrigin stays false so the API sees the page's own Host.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:__SERVER_PORT__', changeOrigin: false } },
  },
  build: { sourcemap: false },
})
