# Changelog

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
