import { defineConfig } from 'astro/config'

// The Pages dev server proxies /api to `wrangler pages dev` (scripts/dev.mjs). `format: 'file'`
// because Pages answers a directory-style page with a 308 to its trailing slash.
export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  server: { port: 4321 },
  vite: {
    server: { proxy: { '/api': { target: 'http://127.0.0.1:8788', changeOrigin: false } } },
  },
})
