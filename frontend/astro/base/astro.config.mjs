import { defineConfig } from 'astro/config'
import react from '@astrojs/react' // @islands

// `format: 'file'` writes /about as about.html: Cloudflare Pages answers a directory-style page
// (about/index.html) with a 308 to its trailing slash. `security.csp` hashes every script and style
// of the build into a <meta> policy on each page, so the policy needs no 'unsafe-inline'. Sass
// reaches `setup/` through the load path. The server binds 127.0.0.1 (not localhost, which may
// resolve to ::1 first), the address the e2e run and the API proxy use.
export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  security: { csp: true },
  integrations: [react()], // @islands
  // Shiki writes inline styles the policy would refuse; a template ships no Markdown.
  markdown: { syntaxHighlight: false },
  server: { port: __PORT__, host: '127.0.0.1' },
  vite: {
    css: { preprocessorOptions: { scss: { loadPaths: ['src/styles'] } } },
    server: { proxy: { '/api': { target: 'http://127.0.0.1:__SERVER_PORT__' } } }, // @server
  },
})
