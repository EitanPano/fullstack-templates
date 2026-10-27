import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser always calls relative /api on its own origin. The dev server and the preview server
// (the e2e suite runs the production build behind it) forward it to the API; changeOrigin stays
// false so the API sees the page's own Host.
const api = { '/api': { target: 'http://127.0.0.1:__SERVER_PORT__', changeOrigin: false } }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: Number('__PORT__'), strictPort: true, proxy: api },
  preview: { port: Number('__PORT__'), strictPort: true, host: '127.0.0.1', proxy: api },
  build: { sourcemap: false },
})
