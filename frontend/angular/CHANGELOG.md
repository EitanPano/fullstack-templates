# Changelog

## 1.0.0 — 2026-11-07

First release (ADR 0006).

### Added

- Angular 22 single-page app on standalone components and signals, with `@ngrx/signals` stores, a
  facade per server module over Hey API's generated Angular client, zod-validated typed forms and
  global SCSS in `src/styles/`.
- A layer map enforced by `eslint-plugin-boundaries`, with a lint test per rule.
- The shell: main and auth layouts, header, side-nav drawer, skip link, theme and density, and the
  shared components (button, form controls, modal, toast, data table and the state patterns).
- The `i18n` flag (default on): Transloco with English and Hebrew (RTL), a language toggle and a
  translation parity test.
- The `pwa` flag (default on): web manifest, icons, the Angular service worker, update and install
  prompts.
- Session glue behind the server's `auth` flag: HttpOnly-cookie session hint, guards, one refresh and
  one replay on a 401, sign-in, sign-up, OTP and profile screens.
- Playwright and axe e2e (shell, screens, smoke, auth), a dependency-free static server for `dist/`,
  and the `dist` and `serve` Docker targets with the `split` mode's nginx and Compose fragment.
