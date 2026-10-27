# Changelog

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
