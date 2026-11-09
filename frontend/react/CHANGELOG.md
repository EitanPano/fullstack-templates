# Changelog

## 4.0.0 — 2026-11-09

The template's tree on `pages/`, `components/` and co-located styles
([ADR 0009](../../docs/adr/0009-pages-components-colocated-styles.md)). A breaking move: the
routed pages sit flat in `pages/<module>/`, the app-wide components in `components/` with the
`app-` prefix, and every stylesheet beside the page or component that owns it, on a global token
tree in `src/styles/`. No behaviour changes except the two additions below. A project generated
from 3.x does not upgrade in place: the table is the migration.

### Breaking

All paths are under `src/`. A file whose test moved with it carries the test in the same row.

| Old path                                                                                                                                                                                                                                                                                    | New path                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `layout/main-layout/main-layout.tsx` (+ `.test.tsx`)                                                                                                                                                                                                                                        | `components/app-main-layout.tsx` (+ test)                                                 |
| `layout/main-layout/main-loading.tsx`                                                                                                                                                                                                                                                       | `components/app-main-loading.tsx`                                                         |
| `layout/main-layout/main-error.tsx`                                                                                                                                                                                                                                                         | `components/app-main-error.tsx`                                                           |
| `layout/components/header.tsx`                                                                                                                                                                                                                                                              | `components/app-header.tsx`                                                               |
| `layout/components/nav-links.tsx`                                                                                                                                                                                                                                                           | `components/app-nav-links.tsx`                                                            |
| `layout/components/mobile-nav.tsx`                                                                                                                                                                                                                                                          | `components/app-mobile-nav.tsx`                                                           |
| `layout/components/footer.tsx`                                                                                                                                                                                                                                                              | `components/app-footer.tsx`                                                               |
| `layout/components/user-menu.tsx` (+ test)                                                                                                                                                                                                                                                  | `components/app-user-menu.tsx` (+ test)                                                   |
| `layout/components/theme-menu.tsx` (+ test)                                                                                                                                                                                                                                                 | `components/app-theme-menu.tsx` (+ test)                                                  |
| `layout/components/account-slot.tsx`                                                                                                                                                                                                                                                        | `components/app-account-slot.tsx`                                                         |
| `layout/components/account-menu.tsx` (+ test), with auth                                                                                                                                                                                                                                    | `components/app-account-menu.tsx` (+ test)                                                |
| `layout/auth-layout/auth-layout.tsx`, with auth                                                                                                                                                                                                                                             | `components/app-auth-layout.tsx`                                                          |
| `layout/auth-layout/auth-loading.tsx`, with auth                                                                                                                                                                                                                                            | `components/app-auth-loading.tsx`                                                         |
| `layout/auth-layout/auth-error.tsx`, with auth                                                                                                                                                                                                                                              | `components/app-auth-error.tsx`                                                           |
| `features/health/pages/home-page.tsx`                                                                                                                                                                                                                                                       | `pages/health/home-page.tsx`                                                              |
| `features/health/components/*` (`health-badge`, `refresh-health-button`, `system-status`, `system-status-skeleton`, with their tests)                                                                                                                                                       | `pages/health/components/*`                                                               |
| `features/health/health.routes.tsx`, `health.copy.ts`                                                                                                                                                                                                                                       | `pages/health/health.routes.tsx`, `health.copy.ts`                                        |
| `features/not-found/pages/not-found-page.tsx` (+ test)                                                                                                                                                                                                                                      | `pages/not-found/not-found-page.tsx` (+ test)                                             |
| `features/not-found/not-found.routes.tsx`                                                                                                                                                                                                                                                   | `pages/not-found/not-found.routes.tsx`                                                    |
| `features/auth/pages/sign-in-page.tsx`, `sign-up-page.tsx`                                                                                                                                                                                                                                  | `pages/auth/sign-in-page.tsx`, `sign-up-page.tsx`                                         |
| `features/auth/components/*` (`sign-in-form`, `sign-up-form`, with their tests)                                                                                                                                                                                                             | `pages/auth/components/*`                                                                 |
| `features/auth/auth.routes.tsx` (+ test), `auth.form.ts`, `auth.copy.ts`                                                                                                                                                                                                                    | `pages/auth/` (same names)                                                                |
| `features/user/pages/profile-page.tsx`                                                                                                                                                                                                                                                      | `pages/user/profile-page.tsx`                                                             |
| `features/user/components/profile-card.tsx`                                                                                                                                                                                                                                                 | `pages/user/components/profile-card.tsx`                                                  |
| `features/user/user.routes.tsx` (+ test)                                                                                                                                                                                                                                                    | `pages/user/user.routes.tsx` (+ test)                                                     |
| `features/forbidden/pages/forbidden-page.tsx`                                                                                                                                                                                                                                               | `pages/forbidden/forbidden-page.tsx`                                                      |
| `features/forbidden/forbidden.routes.tsx`                                                                                                                                                                                                                                                   | `pages/forbidden/forbidden.routes.tsx`                                                    |
| `styles/components/_root-error.scss`                                                                                                                                                                                                                                                        | `app/root-error.scss`                                                                     |
| `styles/components/_main-loading.scss`                                                                                                                                                                                                                                                      | `components/app-main-loading.scss`                                                        |
| `styles/components/_header.scss` (also holds the `.nav-links` rules)                                                                                                                                                                                                                        | `components/app-header.scss`                                                              |
| `styles/components/_mobile-nav.scss`                                                                                                                                                                                                                                                        | `components/app-mobile-nav.scss`                                                          |
| `styles/components/_footer.scss`                                                                                                                                                                                                                                                            | `components/app-footer.scss`                                                              |
| `styles/components/_user-menu.scss`                                                                                                                                                                                                                                                         | `components/app-user-menu.scss`                                                           |
| `styles/components/_account-menu.scss`, with auth                                                                                                                                                                                                                                           | `components/app-account-menu.scss`                                                        |
| `styles/components/_auth-layout.scss` (also holds `.auth-loading`), with auth                                                                                                                                                                                                               | `components/app-auth-layout.scss`                                                         |
| `styles/views/_home.scss`                                                                                                                                                                                                                                                                   | `pages/health/home-page.scss`                                                             |
| `styles/views/_not-found.scss`                                                                                                                                                                                                                                                              | `pages/not-found/not-found-page.scss`                                                     |
| `styles/views/_profile.scss`                                                                                                                                                                                                                                                                | `pages/user/profile-page.scss`                                                            |
| `styles/views/_forbidden.scss`                                                                                                                                                                                                                                                              | `pages/forbidden/forbidden-page.scss`                                                     |
| `styles/views/_sign-in.scss`, `_sign-up.scss` (comments only)                                                                                                                                                                                                                               | deleted; the two pages import nothing until a product adds rules and a sibling sheet      |
| `styles/views/_index.scss`, `styles/components/_index.scss`                                                                                                                                                                                                                                 | deleted; there is no forwarding index                                                     |
| `styles/components/_alert`, `_auth-card`, `_avatar`, `_badge`, `_button`, `_card`, `_checkbox`, `_dialog`, `_dropdown-menu`, `_empty-state`, `_form-actions`, `_page`, `_radio-group`, `_select`, `_separator`, `_sheet`, `_skeleton`, `_spinner`, `_switch`, `_tabs`, `_tooltip` (`.scss`) | `shared/components/<name>.scss`, beside the component (`alert.scss`, `auth-card.scss`, …) |
| `styles/components/_controls.scss`                                                                                                                                                                                                                                                          | `shared/components/controls.scss`, imported by `input.tsx` and `textarea.tsx`             |
| `styles/components/_form-field.scss`                                                                                                                                                                                                                                                        | `shared/components/form/field-frame.scss`                                                 |
| `styles/components/_toast.scss`                                                                                                                                                                                                                                                             | `shared/components/toaster.scss`                                                          |
| `styles/components/_error-state.scss`                                                                                                                                                                                                                                                       | `shared/components/error-state.scss` (new file; the old partial was dropped)              |
| `styles/components/_icon.scss` (`.icon`, `.icon--lg`)                                                                                                                                                                                                                                       | `styles/basics/_helpers.scss`                                                             |
| none                                                                                                                                                                                                                                                                                        | `styles/setup/_layers.scss`: `@layer setup, themes, basics;`                              |

- Renamed exports: `MainLayout` → `AppMainLayout`, `MainLoading` → `AppMainLoading`, `MainError` →
  `AppMainError`, `Header` → `AppHeader`, `NavLinks` → `AppNavLinks` (and `SheetNavLinks` stays),
  `MobileNav` → `AppMobileNav`, `Footer` → `AppFooter`, `UserMenu` → `AppUserMenu`, `ThemeMenu` →
  `AppThemeMenu`, `AccountSlot` → `AppAccountSlot`, `AccountMenu` → `AppAccountMenu`, `AuthLayout` →
  `AppAuthLayout`, `AuthLoading` → `AppAuthLoading`, `AuthError` → `AppAuthError`.
- The rule: `src/styles/` holds `styles.scss`, `setup/`, `themes/` and `basics/` and nothing else,
  in cascade layers (`setup`, `themes`, `basics`). Each page and component imports its sibling
  `.scss` as `import './<stem>.scss'`, the last import of the file; the sheet `@use`s `setup/…`
  only and is never layered, so it wins over the global rules. A partial two sibling files share
  is imported by each. `main.tsx` is the only file that imports the global tree.
- `layout/`, `features/`, `styles/components/` and `styles/views/` no longer exist; the boundaries
  lint knows `components` and `page` and refuses a file in the old directories.

### Added

- `shared/hooks/`: `useMediaQuery`, `useOnlineStatus` (both on `useSyncExternalStore`) and
  `useDebouncedValue`, each with a happy-path and an unsubscribe or empty test. `useDebouncedValue`
  has no caller in the template by design.
- An offline badge in the header (`role="status"`, in a polite live region) while
  `useOnlineStatus()` is false.
- The phone sheet closes when the viewport reaches `md` (it was left open as a modal once its
  trigger was hidden).
- The owner scan in `tests/unit/styles-tree.test.ts`: every stylesheet outside `src/styles/` has a
  sibling owner that imports it last, a global partial holds only `@use`, comments and its layer
  block, and `components/` files carry `app-`; each rule has a seeded temporary-tree test.

### Changed

- The boundaries lint messages name `components` and `page`; `eslint-boundaries.test.ts` gains the
  refused unknown paths (`src/layout/`, `src/features/`) and the allowed new ones.
- `density.test.ts` compiles `styles.scss` plus every sibling sheet; its assertions are unchanged.
- The `server:auth` file list in `template.yaml` names the new paths.

## 3.0.0 — 2026-11-07

The template's own structure on Redux Toolkit, RTK Query and global SCSS
([ADR 0007](../../docs/adr/0007-react-redux-rtk-scss.md)). A breaking restructure: a project
generated from 2.x does not upgrade in place.

### Breaking

- The layer map is React's own: `app/` (wiring), `core/` (configuration, the auth guards and hint,
  the theme logic), `layout/` (the shell and the auth frame), `features/<module>/` (one directory
  per server module or screen group, with its routes file, pages, components, form schemas and
  copy), `store/` (Redux Toolkit slices, the listener middleware, the typed hooks), `services/`
  (the RTK Query API, one endpoints file per server module, over the generated SDK), `shared/`
  (components, utils), `models/` (one file per noun) and `styles/` (the global SCSS tree).
  `widget/`, `feature/<action>/`, `entity/` and the Next-style `app/(group)/page.tsx` files are gone.
- Pages are loaded with React Router's `lazy`, each its own chunk; after a redeploy an open tab
  that asks for a chunk the new image no longer has reloads itself (`vite:preloadError`).
- Removed without replacement: the `RequireRole` component (a staff route uses the `requireRole`
  loader guard; a control hidden by role is a product decision). Renamed: `ThemeToggle` is
  `ThemeMenu` in `layout/components/`; the shadcn `Field` family is `FieldFrame` in
  `shared/components/form/`; the session's 30 s staleness is the client's
  `refetchOnMountOrArgChange`, not a `SESSION_STALE_MS` constant. The `antialiased` body class is
  gone with Tailwind.
- Data: Redux Toolkit with RTK Query (`fakeBaseQuery` over the generated SDK, tags per server
  module, the route loader prefetches through the store) replaces TanStack Query and the generated
  query options. `call` returns `{ data } | { error: ApiError }` (a plain, serialisable object)
  instead of throwing an `ActionError`; a hook exposes the error and `.unwrap()` rejects with it.
- Styling: the global SCSS tree in `src/styles/` (`setup/`, `themes/`, `basics/`, `components/`,
  `views/`) with BEM class names replaces Tailwind CSS and the shadcn components; the primitives
  stay on Radix (`radix-ui`) and are rendered by `src/shared/components/`. The dark theme is
  `[data-theme='dark']` on `<html>` (was the `dark` class); `theme-init.js` and the theme listener
  write the resolved value. The generated brand tokens live in `src/styles/themes/brand.css`.
  Tailwind, `@tailwindcss/vite`, `tw-animate-css`, `tailwind-merge`, `class-variance-authority`
  and `components.json` are removed; no scaffolder is allowed.
- The generated client lives in `src/services/generated/` (was `src/shared/api/generated/`), with
  the plugins typescript, client-fetch, sdk and zod; its runtime is imported only by `services/`,
  its types only by `services/`, `store/`, `core/` and `models/`.
- Unit tests are co-located (`src/**/*.test.tsx`); `tests/unit/` keeps the tooling checks (the
  boundaries lint, the styles-tree scan, the density compile, the Playwright and e2e-database
  configs). `SIGNED_IN_ROUTES` moves to `tests/e2e/screen-routes.ts`.
- The import rules are the new table in `AGENTS.md`, enforced by `eslint-plugin-boundaries` with a
  seeded violation and an allowed case per row; a `style` attribute and a stylesheet import outside
  `main.tsx` are lint and test errors.

### Added

- `store/theme.slice.ts` with a listener that applies the theme, persists a user's choice (never
  the brand default) and follows the OS while the choice is `system`; `createStore()` is a factory,
  so a test owns a fresh store.
- `src/testing/` with `renderRoutes` (a memory router over the real route table and a fresh store)
  and `stubApi`.

### Unchanged

- The e2e suite's journeys and assertions (shell landmarks, skip link, 44 px targets, the 36 and
  32 px densities, every screen in both themes under axe, the auth journeys), the `phone` and
  `desktop` projects, `vite build && vite preview`, the `Dockerfile`, nginx, the Compose fragments,
  the deploy modes, the brand placeholders and the `check` command.

## 2.1.1 — 2026-10-29

### Fixed

- The root `.gitignore` no longer lists `.next/` and `next-env.d.ts`: they moved out of the shared `node` section into a `next` section that only `frontend/next` declares.

## 2.1.0 — 2026-10-29

The screens spec checks what it captures, and signed-in screens join it (plan 016 of the harness).

### Added

- `tests/e2e/screens.spec.ts` runs three checks on every route, theme and project, beside the screenshots (their names are unchanged): no axe violation of the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` tags (in dark mode this is the contrast measurement), no horizontal scroll, and exactly one `h1`; before scanning, `screenProblems` waits for `networkidle`. A failure names the route, theme and project and lists the rule ids and targets (`screenProblems` in `tests/e2e/support.ts`).
- `SIGNED_IN_ROUTES` beside `ROUTES` (with the server's auth): `/profile` and `/forbidden`, captured and checked after signing up through the form. An entry may carry a `setup(account)` for a role-gated route; it receives only the browser-test database URL (a name ending in `_e2e`); against a running stack (`E2E_BASE_URL` set) the entries with a `setup` are left out when the tests are collected, with no registration spent. After a `setup` the spec signs out and signs in again so the session carries the promoted role, and each signed-in test sets its timeout from its number of captures. A route in both `NAV` and `SIGNED_IN_ROUTES` is captured only signed in. `AGENTS.md › Tests` documents it. A container-mode run now registers eight accounts, not six.
- `AGENTS.md › Auth` says what to update when a product renames the roles `user` and `admin`.
- A role setup's `account.databaseUrl` is a required string and the database guard is loaded only when the server has a database, so a project without one offers no setup surface and `auth` off with `database` on lints clean.

### Fixed

- The Account menu icon button stayed 36 px under `--density compact`; `size="icon"` and the trigger's skeleton now follow the density (32 px on a fine pointer, still 44 px on touch), and the desktop densities test expects it.

## 2.0.1 — 2026-10-28

Fixes for projects generated with non-default brand values; the default brand was unaffected.

### Fixed

- `tests/unit/theme-provider.test.tsx` used `toTheme('__THEME_DEFAULT__')` as its "anything else" value; the generator substituted the placeholder, so `--theme dark` or `--theme light` made `check` fail. It now uses `sepia`.
- The desktop test "controls keep the shadcn densities on the desktop project" expected 36 px controls, so `--density compact` (32 px Refresh button, as the CSS intends) failed `testE2e`. It now clears `data-density` for the comfortable sizes and sets `compact` for the compact ones, whatever the project was generated with.
- The generator now keeps the primary readable as text (4.5:1) on the page, cards and popovers, because the button's `link` variant paints `text-primary` there. A pale primary such as `--brand-primary '#ea580c'` (3.55:1 on white) made the auth screens fail the axe `color-contrast` check; its lightness now moves until it passes.
- The generator prints a `note:` line when it moves the primary's lightness for contrast (seed, shipped colour, mode), and the theme builder now checks the dark-mode primary against the page, cards and popovers the same way.
- "The theme menu switches to dark and the choice survives a reload" starts from Light, so it proves something when the project was generated with `--theme dark`.
- E2E timing race, threshold unchanged: the phone sheet is measured after its slide-in animation settles (a mid-slide read gave 43.99998 px).

## 2.0.0 — 2026-10-27

The frontend foundation for the single-page app (plan 013). A breaking restructure: a project generated from 1.x does not upgrade in place.

### Breaking

- New layers: `app/` (routing only), `widget/<section>/`, `feature/<action>/`, `entity/<noun>/` and `shared/` (`ui/`, `ui/pattern/`, `ui/form/`, `lib/`, `api/`, `auth/`, `config/env.ts`). The old `feature/health` is now `entity/health`, `feature/refresh-health` and `widget/system-status`.
- Moved paths: `src/lib/api/` is `src/shared/api/`, `src/env.ts` is `src/shared/config/env.ts`, and the data layer of a slice is its `api/` folder.
- The contract client changes: Hey API (`@hey-api/openapi-ts` 0.99.0) with its TanStack Query plugin replaces `openapi-typescript` and `openapi-fetch`. `src/lib/api/schema.d.ts` is replaced by `src/shared/api/generated/` (types, SDK, fetch client, zod, query options and keys; committed, lint-ignored). Re-run `bun run api:types`.
- `ActionResult` (`shared/lib/action.ts`) is removed. A mutation is a `useMutation` over `call`, which returns the data or throws an `ActionError` with our copy (never the server's text).
- `StatusPill` and the hand-written `Button` are replaced by badges and the shadcn button.
- `tests/unit/lint-zones.test.ts` is replaced by `tests/unit/eslint-boundaries.test.ts`; `eslint-plugin-boundaries` 7.2.0 replaces the hand-written import zones.
- `bun run test:e2e` starts a fresh API (`reuseExistingServer: false`) and the production build behind `vite preview`; with a database it runs `e2eDb && start` on `app_e2e` and refuses a name that does not end in `_e2e`. `retries` is 0.
- `vite preview` now shares the dev server's port and `/api` proxy (to `127.0.0.1`); both are `strictPort`.

### Added

- Design system: shadcn/ui (CLI 4.21.4, new-york) on `radix-ui` 1.8.0 in `shared/ui`, the same primitives and patterns as the Next template with React Router's `Link` and `NavLink`; OKLCH tokens from the generator placeholders; `h-9 pointer-coarse:h-11` sizing; a phone sheet navigation. A `ThemeProvider` (class strategy, brand default, system preference followed) with `public/theme-init.js`, a file rather than an inline script because the deployed pages carry `script-src 'self'`.
- Lint: the browser controls are errors outside `shared/ui`, a bare `fetch(` outside `shared/api`, `import.meta.env` outside `shared/config/env.ts`.
- Reads: TanStack Query 5.104.2. Loaders call `queryClient.query(...)`, widgets `useSuspenseQuery`, mutations invalidate the entity's key.
- Forms: React Hook Form 7.90.0 with `zodResolver`; `shared/ui/form/` bindings with `aria-invalid` and a merged `aria-describedby`; `reportFailure` puts field errors on their fields and toasts the rest (including a field error whose path is not a field of the form).
- Dates: `date-fns` 4.4.0 with `@date-fns/tz` 1.5.0 in `shared/lib/date.ts` (a daylight-saving gap is refused, an ambiguous time takes the earlier instant, an unknown zone does not throw).
- Errors and loading: a pathless route per group with its `HydrateFallback` and `ErrorBoundary` inside the group's layout, a catch-all that keeps a 404 in the shell, a skeleton per widget, and `root-error.tsx` for the rest.
- Auth, only with the server's `auth` flag: `shared/auth/session.ts` (`readSession`, `requireAccount`, `requireRole`, `redirectIfSignedIn`, `returnToOf`), `RequireRole`, `safeNextPath`, `feature/auth` (`useSignIn`, `useSignUp`, `useSignOut`), the `(auth)` group with sign-in and sign-up, `/forbidden`, the guarded `/profile`, `entity/user` and `widget/account-menu`. Without the flag the account slot is the theme menu.
- E2E: projects `phone` (every journey with axe) and `desktop` (shell and screens), their checks routed by `@phone` and `@desktop` tags, so no test skips at run time; journeys for health and Refresh, sign-up, sign-out, sign-in, a wrong password, a taken email on its field, a signed-in account kept off sign-in and a guarded redirect; `screens.spec.ts` writes `test-results/screens/`. A URL assertion after a sign-up, sign-in or sign-out waits up to 15 s.
- Cases: `default`, `split`, `bun`, `alone` and `auth-off`.

### Changed

- `shared/api/client.ts` configures the one client: relative `/api` on the page origin, same-origin cookies, and a `fetch` that turns a 401 into one `POST /api/auth/refresh` and a retry, collapsing concurrent refreshes into one. No token is readable by JavaScript.
- A `localStorage` flag (`session-hint`, never a token) limits the refresh to browsers that signed in. A refresh answered 400, 401 or 403 clears it (400 is what the servers answer once the browser has dropped the expired cookie); a 429, a 5xx and a network error keep it. The refresh, the hint and their tests are generated only with the server's `auth` flag.
- `E2E_BASE_URL` keeps its container mode; a blank value now counts as unset. The `_e2e` database guard lives in `scripts/e2e-database-url.ts`, runs only when Playwright starts its own API, words a malformed URL as the same refusal and rejects names such as `appe2e` and `app_e2e_old`.
- zod runs jitless, so the page raises no CSP `eval` violation.
- A form's email check words every failure itself, whatever format the generated schema carries.
- `AGENTS.md`: the layer map, where each addition goes, Reads, Mutations, Forms, Dates, Auth, Styling, Errors, Tests and Deployment rewritten (the client address note says it does not apply here).

### Upgrade notes

- Regenerate the project rather than editing a 1.x tree in place; move product code into the new layers and re-run `bun run api:types`.
- Fix imports of `@/lib/api/*` and `@/env`, and replace `ActionResult` call sites with `useMutation` over `call`.
- Install Playwright's browser once with `bun x playwright install chromium`; the suite needs the server's `start` command (and, with a database, its `e2eDb` command).
- Browsers that signed in before the upgrade have no session hint: they see the signed-out view until they sign in again.

## 1.1.0 — 2026-10-25

- The UI baseline (catalog ADR 0004): an app shell (`shared/ui/app-shell.tsx`, composed by
  `app/layout.tsx`; skip link, header with `<nav aria-label="Primary">` from `app/nav.ts`, one
  `main`, footer) and a `Button` primitive with a 44 px target (`shared/ui/button.tsx`).
- `globals.css` gains colour tokens (muted, border, input, primary, ring, with dark values) and the
  type, radius and shadow tokens. Spacing is Tailwind's default 4 px scale, unchanged.
- Playwright gains a `phone` project (Pixel 7, screenshots on) and `shell.spec.ts`.
- `AGENTS.md` (`Adding a feature`, `Styling`, `Tests`) states mobile first, the scales, the
  44 px rule, the shell, the phone project and the e2e data rule.
- The home page heading is `Home`; the project name is in the header.

## 1.0.0 — 2026-10-24

- First release: Vite and React 19 single-page app, React Router 8 in data mode, Tailwind 4,
  sonner and lucide-react, a typed client generated from the server's contract (committed
  `src/lib/api/schema.d.ts`), Vitest and Playwright with axe.
- Packaging: a `Dockerfile` with a `dist` target (built files only, for the server's image in
  `single`) and a `serve` target on `nginx-unprivileged` (non-root, templated port, the helmet
  headers, SPA fallback, `/api/` proxy) for `split`; the per-mode Compose fragment; stacks
  `react-python-fastapi` and `react-bun-express`.
- The root error boundary logs the cause with `console.error`, like the route boundaries.
- The client lint rule also covers the suffixed spellings (`client.ts`, `client.js`, `client.tsx`).
- Lint enforces the layer boundaries with disjoint zones, proved by a unit test that lints one
  seeded violation per zone.
- `AGENTS.md › Deployment` lists the Compose lines of both modes verbatim from `compose.yaml` (shown only when a server is in the project), so a project generated in one mode can be moved to the other; a unit test keeps them equal to the fragment.
