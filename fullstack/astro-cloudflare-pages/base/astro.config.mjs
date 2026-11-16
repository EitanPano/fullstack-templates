import { defineConfig } from 'astro/config'

// The Pages dev server proxies /api to `wrangler pages dev` (scripts/dev.mjs). `format: 'file'`
// because Pages answers a directory-style page with a 308 to its trailing slash. `security.csp`
// hashes every script and style of the build; scripts/csp-headers.mjs moves the policy into
// dist/_headers after the build (`bun run build`). Sass reaches `setup/` through the load path.
export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  security: { csp: true },
  // Shiki writes inline styles the policy would refuse; a template ships no Markdown.
  markdown: { syntaxHighlight: false },
  server: { port: 4321 },
  vite: {
    css: { preprocessorOptions: { scss: { loadPaths: ['src/styles'] } } },
    server: { proxy: { '/api': { target: 'http://127.0.0.1:8788', changeOrigin: false } } },
  },
})
