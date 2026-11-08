# Changelog

## 1.0.0 — 2026-11-08

First release (ADR 0008).

### Added

- Vue 3 single-page app on Vite, `<script setup lang="ts">` and the Composition API only, with Vue
  Router 5 route tables, Pinia 4 setup stores, a facade per server module over Hey API's generated
  fetch client and flat SDK, zod-validated forms (`useZodForm`) and global SCSS in `src/styles/`.
- A layer map enforced by `eslint-plugin-boundaries`, with a lint test per rule.
- The shell: main and auth layouts, header, side-nav drawer, skip link, theme and density, and the
  shared components on Reka UI primitives (button, form controls, modal, toast, data table and the
  state patterns).
- The `i18n` flag (default on): vue-i18n with English and Hebrew (RTL), a language toggle and a
  translation parity test.
- The `pwa` flag (default on): web manifest, icons, the Workbox service worker through
  `vite-plugin-pwa`, update and install prompts.
- Session glue behind the server's `auth` flag: HttpOnly-cookie session with a
  `localStorage` session hint, guards, one refresh and one replay on a 401, sign-in, sign-up, OTP
  and profile screens.
- Playwright and axe e2e (shell, screens, smoke, auth), and the `dist` and `serve` Docker targets
  with the `split` mode's nginx and Compose fragment.
