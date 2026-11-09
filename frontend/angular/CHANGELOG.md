# Changelog

## 2.0.0 — 2026-11-09

The template's tree on `pages/`, `components/` and co-located styles
([ADR 0009](../../docs/adr/0009-pages-components-colocated-styles.md)). A breaking move: the routed
pages sit in `pages/<module>/<page>/`, the app-wide components in `components/app-<name>/` with
`App` on the class, and every stylesheet beside the component or page that owns it, under emulated
encapsulation, on a global token tree in `src/styles/`. No behaviour changes except the additions
below. A project generated from 1.x does not upgrade in place: the table is the migration.

### Breaking

All paths are under `src/`. A file's spec and template move with it.

| Old path                                                                                                                                                | New path                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/layout/main-layout/main-layout.component.*`                                                                                                        | `app/components/app-main-layout/app-main-layout.component.*`                                                                                                   |
| `app/layout/auth-layout/auth-layout.component.*`, with auth                                                                                             | `app/components/app-auth-layout/app-auth-layout.component.*`                                                                                                   |
| `app/layout/components/header/header.component.*`                                                                                                       | `app/components/app-header/app-header.component.*`                                                                                                             |
| `app/layout/components/side-nav/side-nav.component.*`                                                                                                   | `app/components/app-side-nav/app-side-nav.component.*`                                                                                                         |
| `app/layout/components/footer/footer.component.*`                                                                                                       | `app/components/app-footer/app-footer.component.*`                                                                                                             |
| `app/features/health/pages/health-status/*`                                                                                                             | `app/pages/health/health-status/*`                                                                                                                             |
| `app/features/health/components/health-badge/*`                                                                                                         | `app/pages/health/components/health-badge/*`                                                                                                                   |
| `app/features/health/health.routes.ts`                                                                                                                  | `app/pages/health/health.routes.ts`                                                                                                                            |
| `app/features/not-found/pages/not-found/*`, `not-found.routes.ts`                                                                                       | `app/pages/not-found/not-found/*`, `app/pages/not-found/not-found.routes.ts`                                                                                   |
| `app/features/auth/pages/{login,register,verify-otp}/*`, with auth                                                                                      | `app/pages/auth/{login,register,verify-otp}/*`                                                                                                                 |
| `app/features/auth/auth.routes.ts`, `auth.form.ts` (+ spec), with auth                                                                                  | `app/pages/auth/` (same names)                                                                                                                                 |
| `app/features/user/pages/profile/*`, with auth                                                                                                          | `app/pages/user/profile/*`                                                                                                                                     |
| `app/features/user/user.routes.ts`, `user.form.ts` (+ spec), with auth                                                                                  | `app/pages/user/` (same names)                                                                                                                                 |
| `app/features/forbidden/pages/forbidden/*`, `forbidden.routes.ts`                                                                                       | `app/pages/forbidden/forbidden/*`, `app/pages/forbidden/forbidden.routes.ts`                                                                                   |
| `styles/components/_header.scss`                                                                                                                        | `app/components/app-header/app-header.component.scss`                                                                                                          |
| `styles/components/_side-nav.scss`                                                                                                                      | `app/components/app-side-nav/app-side-nav.component.scss`                                                                                                      |
| `styles/components/_footer.scss`                                                                                                                        | `app/components/app-footer/app-footer.component.scss`                                                                                                          |
| `styles/components/_auth-layout.scss`, with auth                                                                                                        | `app/components/app-auth-layout/app-auth-layout.component.scss`                                                                                                |
| `styles/components/_button`, `_spinner`, `_skeleton`, `_page-header`, `_empty-state`, `_error-state`, `_data-table`, `_form-actions`, `_icon` (`.scss`) | `app/shared/components/<name>/<name>.component.scss`                                                                                                           |
| `styles/components/_auth-card.scss`, with auth                                                                                                          | `app/shared/components/auth-card/auth-card.component.scss`                                                                                                     |
| `styles/components/_form-field.scss`                                                                                                                    | `app/shared/components/form-field/form-field.component.scss`                                                                                                   |
| `styles/components/_controls.scss` (`.control*`, `.checkbox*`)                                                                                          | `app/shared/components/controls.scss` (`styleUrls` of `input`, `select`, `textarea`) and `app/shared/components/checkbox/checkbox.component.scss`              |
| `styles/components/_modal.scss`                                                                                                                         | `app/shared/components/modal/modal.component.scss`, and `modal/confirm-dialog.component.scss` for `.modal__actions`                                            |
| `styles/components/_toast.scss`                                                                                                                         | `app/shared/components/toast/toast.component.scss`                                                                                                             |
| `styles/views/_health-status.scss`                                                                                                                      | `app/pages/health/health-status/health-status.component.scss`, and `app/pages/health/components/health-badge/health-badge.component.scss` for `.health-badge*` |
| `styles/views/_not-found.scss`, `_forbidden.scss`, `_profile.scss`                                                                                      | the page's `<page>.component.scss` beside its component                                                                                                        |
| `styles/views/_login.scss`, `_register.scss`, `_verify-otp.scss`, with auth                                                                             | `app/pages/auth/<page>/<page>.component.scss`                                                                                                                  |
| `styles/components/_index.scss`, `styles/views/_index.scss`                                                                                             | deleted; there is no forwarding index                                                                                                                          |
| none                                                                                                                                                    | `styles/setup/_layers.scss`: `@layer setup, themes, basics;`                                                                                                   |

- Renamed classes: `MainLayoutComponent` → `AppMainLayoutComponent`, `AuthLayoutComponent` →
  `AppAuthLayoutComponent`, `HeaderComponent` → `AppHeaderComponent`, `FooterComponent` →
  `AppFooterComponent`, `SideNavComponent` → `AppSideNavComponent`. The selectors are unchanged
  (`app-header`, `app-footer`, `app-side-nav`, `app-main-layout`, `app-auth-layout`). Page
  components and the shared components keep their names (`LoginComponent`, `ButtonComponent`).
- `AppSideNavComponent.open` is a `model(false)`; the `closed` output is gone. A caller binds
  `[(open)]` instead of `[open]` and `(closed)`.
- The rule: `src/styles/` holds `styles.scss`, `setup/`, `themes/` and `basics/` and nothing else,
  in cascade layers (`setup`, `themes`, `basics`). Each component and page names its sibling
  `<stem>.component.scss` in `styleUrl`; the sheet `@use`s `setup/...` only and is never layered.
  `ViewEncapsulation.None` and `::ng-deep` are refused, so a parent never restyles a child's
  interior: it styles the child's host (when the child is in its own template) or the child takes an
  input. `.form-actions .button`, `.user-menu__panel .button` and the CDK overlay's structural
  rules are gone from the sheets (the form actions rely on flex stretch, the menu rows use
  `app-button`'s new `block` input, the CDK loads its own overlay CSS).
- `app/layout/` and `app/features/` no longer exist; the boundaries lint knows `components`,
  `page`, `page-components`, `page-routes` and `page-form`.

### Added

- `ButtonComponent.block`: fills its container and aligns the label to the start (the account
  menu's rows).
- `AppSideNavComponent.open` as a `model()`, bound two-way by `app-main-layout`, with specs for the
  drawer closing itself and for the parent opening it.
- The owner scan in `tests/unit/component-styles.spec.ts` (renamed from `no-component-styles`):
  `src/styles/` has four entries, every stylesheet is referenced by its sibling component (or shared
  by two), references are `./x.scss` or `../x.scss`, no inline `styles:`, no `ViewEncapsulation.None`,
  no `::ng-deep`, `components/` folders carry `app-` and their classes `App`, the global partials are
  layered and no component sheet is; each rule has a seeded temporary-tree test.
- `boundaries/no-unknown-files`: a file in a directory no layer claims is an error (`main.ts` and
  `src/environments/` are boundaries-ignored).

### Changed

- The modal sizes its pane from its own `:host` and `:host-context(.modal__panel--<size>)`, and
  `ModalService` sets the backdrop colour on the backdrop element: the CDK builds both outside every
  view, where an encapsulated sheet cannot reach them.
- The boundaries lint messages say `components/`, `pages/` and "a page module"; the
  `pages/<module>/<page>` element is two levels deep so a module's `*.routes.ts` and `*.form.ts`
  are not also read as pages. `eslint-boundaries.spec.ts` gains the unknown-folder cases and the
  routes-to-form and form-to-page refusals.
- `AGENTS.md` describes the new tree, the two style homes, emulated encapsulation, the primary
  features in use and the zoneless app.
- The `server:auth` file list in `template.yaml` names the new paths.

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
