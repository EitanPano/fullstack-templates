import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// @server-start
// The browser always calls relative /api on its own origin. The dev server and the preview server
// (the e2e suite runs the production build behind it) forward it to the API; changeOrigin stays
// false so the API sees the page's own Host.
const api = { '/api': { target: 'http://127.0.0.1:__SERVER_PORT__', changeOrigin: false } }
// @server-end

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // loadPaths lets a partial `@use 'setup/variables'` without a relative climb.
  css: {
    preprocessorOptions: {
      scss: { loadPaths: [fileURLToPath(new URL('./src/styles', import.meta.url))] },
    },
  },
  server: { port: Number('__PORT__'), strictPort: true, proxy: api }, // @server
  server: { port: Number('__PORT__'), strictPort: true }, // @noserver
  preview: { port: Number('__PORT__'), strictPort: true, host: '127.0.0.1', proxy: api }, // @server
  preview: { port: Number('__PORT__'), strictPort: true, host: '127.0.0.1' }, // @noserver
  build: { sourcemap: false },
})
