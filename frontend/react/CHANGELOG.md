# Changelog

## 1.0.0 — 2026-10-24

- First release: Vite and React 19 single-page app, React Router 8 in data mode, Tailwind 4,
  sonner and lucide-react, a typed client generated from the server's contract (committed
  `src/lib/api/schema.d.ts`), Vitest and Playwright with axe.
- Packaging: a `Dockerfile` with a `dist` target (built files only, for the server's image in
  `single`) and a `serve` target on `nginx-unprivileged` (non-root, templated port, the helmet
  headers, SPA fallback, `/api/` proxy) for `split`; the per-mode Compose fragment; stacks
  `react-python-fastapi` and `react-bun-express`.
- Lint enforces the layer boundaries with disjoint zones, proved by a unit test that lints one
  seeded violation per zone.
