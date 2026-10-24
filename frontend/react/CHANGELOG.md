# Changelog

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
