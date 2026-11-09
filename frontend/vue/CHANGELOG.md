# Changelog

## 2.0.0 — 2026-11-09

The template's tree on `pages/`, `components/` and co-located styles
([ADR 0009](../../docs/adr/0009-pages-components-colocated-styles.md)). A breaking move: the
routed pages sit flat in `pages/<module>/`, the app-wide components in `components/` with the
`app-` prefix, the primitives are `Base*`, and every stylesheet sits beside the page or component
that owns it, on a global token tree in `src/styles/`. No behaviour changes except the addition
below. A project generated from 1.x does not upgrade in place: the tables are the migration.

### Breaking

All paths are under `src/`. A file whose spec moved with it carries the spec in the same row.

| Old path                                                                                                                      | New path                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `layout/main-layout/main-layout.vue` (+ spec)                                                                                 | `components/app-main-layout.vue` (+ spec)                               |
| `layout/auth-layout/auth-layout.vue` (+ spec), with auth                                                                      | `components/app-auth-layout.vue` (+ spec)                               |
| `layout/components/app-header.vue`, `app-footer.vue` (+ specs)                                                                | `components/app-header.vue`, `app-footer.vue` (+ specs)                 |
| `layout/components/side-nav.vue` (+ spec)                                                                                     | `components/app-side-nav.vue` (+ spec)                                  |
| `layout/components/nav-links.vue`                                                                                             | `components/app-nav-links.vue`                                          |
| `layout/components/toast-host.vue` (+ spec)                                                                                   | `components/app-toast-host.vue` (+ spec)                                |
| `layout/components/account-menu.vue` (+ spec), with auth                                                                      | `components/app-account-menu.vue` (+ spec)                              |
| `layout/components/install-button.vue` (+ spec), with `pwa`                                                                   | `components/app-install-button.vue` (+ spec)                            |
| `layout/components/language-toggle.vue` (+ spec), with `i18n`                                                                 | `components/app-language-toggle.vue` (+ spec)                           |
| `layout/components/slots.ts` (+ spec), `layout/rtl.spec.ts`                                                                   | `components/slots.ts` (+ spec), `components/rtl.spec.ts`                |
| `features/health/pages/health-status-page.vue` (+ spec)                                                                       | `pages/health/health-status-page.vue` (+ spec)                          |
| `features/health/components/health-badge.vue` (+ spec)                                                                        | `pages/health/components/health-badge.vue` (+ spec)                     |
| `features/health/health.routes.ts` (+ spec)                                                                                   | `pages/health/health.routes.ts` (+ spec)                                |
| `features/not-found/pages/not-found-page.vue` (+ spec), `not-found.routes.ts` (+ spec)                                        | `pages/not-found/` (same names, the page beside the routes)             |
| `features/auth/pages/login-page.vue`, `register-page.vue`, `verify-otp-page.vue` (+ specs), with auth                         | `pages/auth/` (same names)                                              |
| `features/auth/auth.routes.ts`, `auth.form.ts` (+ specs), with auth                                                           | `pages/auth/` (same names)                                              |
| `features/user/pages/profile-page.vue` (+ spec), `user.routes.ts`, `user.form.ts` (+ specs), with auth                        | `pages/user/` (same names, the page beside the routes)                  |
| `features/forbidden/pages/forbidden-page.vue` (+ spec), `forbidden.routes.ts` (+ spec), with auth                             | `pages/forbidden/` (same names, the page beside the routes)             |
| `shared/components/app-button`, `app-checkbox`, `app-icon`, `app-input`, `app-modal`, `app-select` (`.vue` + spec)            | `shared/components/base-<name>.vue` (+ spec)                            |
| `shared/components/app-skeleton`, `app-spinner`, `app-textarea`, `app-toast` (`.vue` + spec)                                  | `shared/components/base-<name>.vue` (+ spec)                            |
| `styles/components/_header.scss` (also holds `.badge`)                                                                        | `components/app-header.scss`                                            |
| `styles/components/_footer.scss`                                                                                              | `components/app-footer.scss`                                            |
| `styles/components/_side-nav.scss` (also holds `.shell__nav`, the nav-link rules)                                             | `components/app-side-nav.scss`                                          |
| `styles/components/_account-menu.scss`, with auth                                                                             | `components/app-account-menu.scss`                                      |
| `styles/components/_auth-layout.scss`, with auth                                                                              | `components/app-auth-layout.scss`                                       |
| `styles/components/_toast.scss` (the viewport rules)                                                                          | `components/app-toast-host.scss`                                        |
| `styles/components/_toast.scss` (the `.toast` rules)                                                                          | `shared/components/base-toast.scss`                                     |
| `styles/components/_button`, `_icon`, `_modal`, `_skeleton`, `_spinner` (`.scss`)                                             | `shared/components/base-<name>.scss`                                    |
| `styles/components/_controls.scss`                                                                                            | `shared/components/controls.scss`, referenced by the four form controls |
| `styles/components/_auth-card`, `_data-table`, `_empty-state`, `_error-state`, `_form-actions`, `_form-field`, `_page-header` | `shared/components/<name>.scss`, beside the component                   |
| `styles/views/_health-status.scss` (the `.health-status` rules)                                                               | `pages/health/health-status-page.scss`                                  |
| `styles/views/_health-status.scss` (the `.health-badge` rules)                                                                | `pages/health/components/health-badge.scss`                             |
| `styles/views/_login`, `_register`, `_verify-otp` (`.scss`), with auth                                                        | `pages/auth/<name>-page.scss`                                           |
| `styles/views/_not-found.scss`, `_profile.scss`, `_forbidden.scss`                                                            | `pages/<module>/<name>-page.scss`                                       |
| `styles/views/_index.scss`, `styles/components/_index.scss`                                                                   | deleted; there is no forwarding index                                   |

Renames inside the files, repeated in every template, import and spec:

| Old                                                                                                                                | New                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppButton`, `AppCheckbox`, `AppIcon`, `AppInput`, `AppModal`, `AppSelect`, `AppSkeleton`, `AppSpinner`, `AppTextarea`, `AppToast` | `BaseButton`, `BaseCheckbox`, `BaseIcon`, `BaseInput`, `BaseModal`, `BaseSelect`, `BaseSkeleton`, `BaseSpinner`, `BaseTextarea`, `BaseToast` |
| `MainLayout`, `AuthLayout`, `SideNav`, `NavLinks`, `ToastHost`, `AccountMenu`, `InstallButton`, `LanguageToggle`                   | the same names with the `App` prefix                                                                                                         |
| `@/layout/…`, `@/features/<m>/pages/<p>`, `@/features/<m>/…`                                                                       | `@/components/…`, `@/pages/<m>/<p>`, `@/pages/<m>/…`                                                                                         |

The styles rule changed with the move: a page or component that needs rules owns a sibling `.scss`
with its stem and references it with an empty `<style lang="scss" src="./<stem>.scss"></style>` block,
the last block of the file; a partial two components share is referenced by each of them. `scoped`
and a `<style>` body are refused. `src/styles/` is exactly `styles.scss`, `setup/`, `themes/` and
`basics/`, in cascade layers (`@layer setup, themes, basics;`); the sibling sheets are never layered,
so a page or component wins over the global tree at any specificity. `.icon` stays in
`shared/components/base-icon.scss`.

### Added

- The offline badge in the header enters and leaves through `<Transition name="status">`, with a
  `prefers-reduced-motion` rule that switches the motion off. The toast list stays on Reka's own
  `data-state` motion: Reka portals each toast into its viewport, so a `<TransitionGroup>` on the
  list would wrap a Teleport and animate nothing.
- `tests/unit/styles-tree.spec.ts` scans for stylesheet owners: `src/styles/` is exactly four
  entries; every sheet outside it has a sibling `.vue` with its stem whose `<style lang="scss" src>`
  block is empty and last, or two sibling referencers; no `scoped`, no `<style>` body, no `style`
  attribute; `.vue` files directly in `components/` start with `app-` and none in
  `shared/components/` does; the global partials sit in their `@layer` and no sibling sheet does.
  Each rule has a seeded negative case.

### Changed

- The boundaries lint reads the new tree: the element types are `components` (`src/components`)
  and `page` (`src/pages/<module>`), a page module never imports another, every message names
  `components/`, `pages/` or "a page". `vue/block-lang` pins `lang="scss"` on a `<style>` block
  (the empty `src` block passes) and `vue/no-restricted-block` for `style` is gone.
  `vue/no-restricted-html-elements` points to the `Base` wrapper.
- `density.spec.ts` and `rtl-styles.spec.ts` compile and scan `styles.scss` plus every `.scss`
  outside `styles/`.
- `template.yaml`: the `server:auth`, `i18n` and `pwa` lists name the new paths and carry the
  moved sheets.

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
