# Changelog

## 1.0.0 — 2026-11-16

First release: the package skeleton and its server half ([ADR 0014](../../docs/adr/0014-astro-cloudflare-pages.md)).

- Astro 7 static output (`build.format: 'file'`), a placeholder index and 404 page, Pages Functions
  on the same origin (`public/_routes.json` includes `/api/*` only), `dev` and `start` scripts that
  stop their whole process tree.
- The request flow: `handle(...gates, controller)`, the typed `Context`, the root middleware (request
  id, error envelope, security headers, one JSON log line), `validate`, `rate-limit`.
- The reference `module` and `GET /api/health`, `GET /api/health/ready`.
- D1 through Drizzle: migrations in `migrations/`, `migrate` and `e2eDb` (a separate state folder),
  a rate-limit table hit by one upsert per check.
- Gates without Docker or an account: `wrangler types --check`, `astro check`, two `tsc` projects,
  ESLint import zones proved by a boundary test, Prettier, and vitest in `workerd`.
- `lanes` for the harness: backend, frontend and qa paths of the package.
