# Changelog

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
