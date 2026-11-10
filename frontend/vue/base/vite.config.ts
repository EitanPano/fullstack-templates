import { fileURLToPath } from 'node:url'

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa' // @pwa
import { defineConfig } from 'vite'

// The browser always calls relative /api on its own origin. The dev server and the preview server
// (the e2e suite runs the production build behind it) forward it to the API; changeOrigin stays
// false so the API sees the page's own Host.
const api = { '/api': { target: 'http://127.0.0.1:__SERVER_PORT__', changeOrigin: false } }

export default defineConfig({
  plugins: [
    vue(),
    // Copy tables are precompiled to message ASTs, so the runtime-only build runs under
    // `script-src 'self'` (no eval).
    VueI18nPlugin({ include: 'src/core/i18n/translations/**' }),
    // @pwa-start
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '__PROJECT_DISPLAY_NAME__',
        short_name: '__PROJECT_DISPLAY_NAME__',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The shell and its assets are precached; a new build replaces them together.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The worker never answers an /api navigation with the shell.
        navigateFallbackDenylist: [/^\/api\//],
        // No API response is cached. A page module adds a `runtimeCaching` rule for a public read
        // that carries no session or personal data, never for /api/user/** or /api/auth/**.
      },
    }),
    // @pwa-end
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // loadPaths lets a partial `@use 'setup/variables'` without a relative climb.
  css: {
    preprocessorOptions: {
      scss: { loadPaths: [fileURLToPath(new URL('./src/styles', import.meta.url))] },
    },
  },
  server: { port: Number('__PORT__'), strictPort: true, proxy: api },
  preview: { port: Number('__PORT__'), strictPort: true, host: '127.0.0.1', proxy: api },
  build: { sourcemap: false },
})
