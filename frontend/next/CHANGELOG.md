# Changelog

## 2.0.0 — 2026-10-26

Frontend foundation (plan 013: D2 layers, D3 design system, D6 to D10 data, mutations, forms, reads and auth, D11 errors and loading, D12 dates). A breaking restructure: a project generated from 1.x does not upgrade in place.

- Layers: `app/` (routing only, with the `(site)` route group), `widget/<section>/`, `feature/<action>/`, `entity/<noun>/` and `shared/` (`ui/`, `ui/pattern/`, `lib/`, `api/`, `config/env.ts`). `src/lib/api/` moved to `src/shared/api/` and `src/env.ts` to `src/shared/config/env.ts`; the data layer is `server/`. The example slices are product-neutral: `entity/health`, `widget/system-status`, `feature/refresh-health`. The home page is a page header plus the widget inside `Suspense`.
- Lint: `eslint-plugin-boundaries` 7.2.0 replaces the hand-written import zones (layer direction, no sibling slices, `shared/api` only from `*/server/*`). A local rule keeps a Client Component to `server/action.ts`. The browser controls (`button`, `input`, `select`, `textarea`) are errors outside `shared/ui`; `revalidatePath` and a bare `fetch(` are errors outside `shared/api`. `tests/unit/eslint-boundaries.test.ts` lints one violation and one allowed case per rule in a throwaway project.
- Design system: shadcn/ui (CLI 4.21.4, new-york) on `radix-ui` 1.8.0 in `shared/ui` (button, input, textarea, label, field, select, checkbox, radio-group, switch, card, badge, alert, skeleton, separator, dialog, sheet, dropdown-menu, avatar, tabs, tooltip, sonner) with `components.json`. Patterns in `shared/ui/pattern`: AppShell with a phone sheet, Page, PageHeader, Section, EmptyState, ErrorState, ListSkeleton, CardSkeleton, AuthCard, FormActions, ConfirmDialog, UserMenu with the theme toggle. `StatusPill` is replaced by badges by meaning.
- Tokens: shadcn's semantic set in OKLCH plus `success`, `warning` and `info`, from the generator placeholders `__THEME_LIGHT__`, `__THEME_DARK__`, `__THEME_RADIUS__`, `__THEME_FONT_STACK__` (Inter through `@fontsource-variable/inter`), `__THEME_DEFAULT__` and `__THEME_DENSITY__`. `__PROJECT_DISPLAY_NAME__` feeds the title template, header and footer. Dark mode is `next-themes` with `attribute="class"` instead of a media query.
- Sizing: `h-9 pointer-coarse:h-11` (icon buttons `pointer-coarse:size-11`), so fine pointers get the shadcn densities and touch gets 44 px. The Playwright projects are `desktop` and `phone`; `shell.spec.ts` asserts 44 px on `phone` and the densities on `desktop`.
- Errors and loading: `loading.tsx`, `error.tsx` and `not-found.tsx` per route group, a skeleton per widget, `global-error.tsx`. An unmatched URL keeps the shell through a catch-all route in the group.
- Fix round: `compact` density only on fine pointers; 44 px Close buttons on Dialog and Sheet; the client-import rule also checks re-exports; `globalThis.fetch(` banned like `fetch(`; `eslint-import-resolver-typescript` 3.10.1 pinned; one `NavEntry` type.
- Health action: `refresh()` from `next/cache` replaces `revalidatePath('/')`; it still returns `ActionResult`.
- Contract (D6): Hey API (`@hey-api/openapi-ts` 0.99.0, a dev dependency) replaces `openapi-typescript` and `openapi-fetch`. `bun run api:types` writes `src/shared/api/generated/` (types, SDK, fetch client, zod; committed, lint-ignored). `createApi({ accessToken, clientHeaders })` in `shared/api/client.ts` builds a per-request client on the server (`credentials: 'omit'`, no custom `fetch`; the generated module-level client is never used); `createRequestApi` reads the current request's headers. Opt-in `CLIENT_IP_HEADER` (a validated header name, unset by default) forwards the rightmost entry of that header as `X-Forwarded-For`; unset, every visitor shares the API's per-address buckets (`AGENTS.md › Deployment`).
- Mutations (D7): next-safe-action 8.7.3. `shared/lib/safe-action.ts` holds `action` (and, with the server's auth, `accountAction` and `roleAction`); `ActionError` carries copy we wrote and `handleServerError` logs and masks everything else. `shared/api/call.ts` (`call`) turns the generated client's result into data or an `ActionError` from the feature's copy table keyed by the envelope's `code`, with defaults per code and for a missing response. `ActionResult` (`shared/lib/action.ts`) is removed.
- Forms (D8): React Hook Form 7.90.0, `@hookform/resolvers` 5.9.1 and `@next-safe-action/adapter-react-hook-form` 2.1.0. `shared/ui/form/` has `Form`, `TextField`, `TextareaField`, `NumberField`, `SelectField`, `CheckboxField`, `PasswordField` and `DateTimeField`; an error shows on its field with `aria-invalid` and `aria-describedby`. A form schema extends the generated one. A global zod message map words the common limits.
- Reads (D9): `cacheComponents: true` and `partialPrefetching: true`. A public loader is `'use cache'` with `cacheTag` and `cacheLife` and throws on failure; a widget is a request-time hole (`await connection()`, then the loader, inside `Suspense`) that renders `ErrorState` on failure, so the image build never calls the API. `updateTag` replaces `refresh()` in `refresh-health`. `entity/health` loses its unreachable branch.
- Dates (D12): `date-fns` 4.4.0 with `@date-fns/tz` 1.5.0 in `shared/lib/date.ts`: wall time to instant and back in a named zone, a time in a daylight-saving gap refused, an ambiguous one taking the earlier instant, day keys and formatting.
- Auth (D10), only when the stack's server has its `auth` flag on (`onlyWhen: server:auth`, `// @server:auth` markers): the Next server keeps the API's tokens in HttpOnly `access_token` and `refresh_token` cookies (`Secure` when `NODE_ENV` is `production`; any other name is accepted); `proxy.ts` refreshes an expired access token (one refresh for concurrent requests, a refusal clears the cookies, an outage changes nothing); `shared/auth/session.ts` has `readSession`, `requireAccount` and `requireRole(role, returnTo?)`, which sends an account with another role to the plain `/forbidden` page (no experimental Next API); `feature/auth` has `signUp`, `signIn` and `signOut` (which refreshes first when only the refresh cookie is left); the `(auth)` route group holds `sign-in` and `sign-up` behind a `GuestOnly` gate; `entity/user` and `widget/account-menu` (the `UserMenu` takes an email). Without the flag the shell's account slot is the theme menu, nothing imports auth types, and `AuthCard` and `AuthCardSkeleton` are not generated.
- Lint: a `model.ts` may `import type` from `@/shared/api` and import the generated zod schemas; the lint test gained cases for both.
- Hardening: field bindings merge a caller's `aria-describedby` with the error link; a server-supplied error path cannot reach the prototype; `wallTimeToInstant` and `instantToWallTime` refuse an unknown zone instead of throwing; `AGENTS.md` documents refresh-token reuse after a lost rotation and the per-address bucket.
- E2E (D13): `bun run test:e2e` runs the production build (`scripts/e2e-server.mjs`: `next build`, then the standalone `server.js`, as the image does) against a fresh API (`reuseExistingServer: false`, `RATE_LIMIT_SCALE=100`, the server's `start` command). With a database the API gets `app_e2e` and its command is `e2eDb && start` (Playwright starts web servers before `globalSetup`, so the database cannot be prepared there). `E2E_BASE_URL` targets an existing stack and starts nothing. Projects `phone` (every spec) and `desktop` (shell and screens); `retries: 0`. Journeys: health and Refresh, sign-up, sign-out and sign-in, a wrong password, a taken email, sign-in redirect, and the guarded `/profile` page; `screens.spec.ts` writes `test-results/screens/<route>-<viewport>-<theme>.png`; `shell.spec.ts` also checks that compact density keeps 44 px touch targets.
- Guarded example: `/profile` (`widget/profile`, `requireAccount('/profile')`), only with the server's auth.
- Fix found by the e2e axe scan: the account menu button is named `Account menu, <initials>` so its name contains its visible text (WCAG 2.5.3).
- Cases: `stack-postgres` (`next-bun-express` with the server's postgres capability, `withApp`: the production e2e also runs against the image) and `python` (`next-python-fastapi`); `auth-off` generates the `next-bun-express` stack with the server's `auth` flag off.
- `AGENTS.md`: the layer map, where each addition goes, the Reads, Mutations, Forms, Dates and Auth recipes, Styling, Errors and Tests rewritten. `bunx shadcn@4.21.4 add <name>` is the one scaffolder an agent may run.

## 1.2.0 — 2026-10-25

UI baseline (ADR 0004 U1 to U5).

- App shell: `shared/ui/app-shell.tsx` (skip link, banner, `nav aria-label="Primary"`, the page's one `main`, footer) and the client leaf `nav-links.tsx` (`aria-current="page"`), composed by `app/layout.tsx` from the new `app/nav.ts` table. The home `h1` is now `Home`; `page.tsx`, `loading.tsx`, `error.tsx` and `not-found.tsx` no longer render their own `main`.
- Token scales in `globals.css`: colours (muted, border, input, primary, ring, each with a dark value), spacing documented as Tailwind's default 4 px multiplier (no `--spacing-<n>` keys), type, radius and two shadows.
- `shared/ui/button.tsx`: the one button, a 44 px touch target; `RefreshButton` and the error page use it.
- Playwright: a `phone` project (`Pixel 7`, screenshots on) beside `chromium`; `tests/e2e/shell.spec.ts` checks the landmarks, the skip link, no horizontal overflow and 44 px targets.
- `AGENTS.md`: Adding a feature (nav entry), Styling (mobile first, scales, 44 px, shell) and Tests (phone project, e2e database and data rule).

## 1.1.1 — 2026-10-24

- Fix: the import zones in `eslint.config.mjs` are enforced. The last `no-restricted-imports` block (`src/**`) replaced the zone rules of the earlier blocks, so a cross-feature `ui/` import, `ui/` or `model.ts` importing `app/`, and `shared/` or `lib/` importing `feature/` or `app/` passed lint. The zones are now disjoint and each lists every restriction that applies to it.
- `tests/unit/eslint-zones.test.ts` lints one snippet per zone through the real config and fails if a zone stops being enforced.
- The client ban now also covers `shared/` and `lib/` (outside `lib/api/`): only `feature/*/server/` may import `@/lib/api/client`, as `AGENTS.md` already said.
- `AGENTS.md` gains `## Deployment`: Next is always deployed `split` (its own image and port, the server behind it on loopback with `TRUST_PROXY` `1`, no `STATIC_DIR`). Its import rules tell agents to use `@/` for cross-directory imports, because the relative cross-feature `ui/` patterns cover a bounded depth.

## 1.1.0 — 2026-10-23

- The e2e API web server's command comes from the server package in the stack
  (`__SERVER_DEV_COMMAND__`), so the frontend runs against a server in any language. Alone it
  keeps `bun run dev`.

## 1.0.1 — 2026-10-22

- `AGENTS.md` gains the sections Adding a feature, Styling, Errors and Tests, the conventions an agent follows in this package.
- Harness-only remarks removed from the example env file, `globals.css` and `page.tsx`.

## 1.0.0 — 2026-10-22

Materialised from create-next-app@16.4.2 plus the fullstack-dev-harness `templates/frontend` overlay; lockfile and generated client types committed.
