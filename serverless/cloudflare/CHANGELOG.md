# Changelog

## 1.0.0 — 2026-11-17

First release: the Pages Functions API of [ADR 0014](../../docs/adr/0014-astro-cloudflare-pages.md),
the first template of the `serverless` kind.

- The request flow: `handle(...gates, controller)`, the typed `Context`, the root middleware (request
  id, error envelope, security headers, one JSON log line), `validate`, `rate-limit`.
- The reference `module` and `GET /api/health`, `GET /api/health/ready`.
- The contract: zod schemas and OpenAPI registrations in `server/api/<module>/schema.ts`,
  `openapi.json` written by `bun run openapi` (the `contract` command) and checked fresh by a unit
  test.
- D1 through Drizzle: migrations in `migrations/`, `migrate` and `e2eDb` (a separate state folder), a
  rate-limit table hit by one upsert per check.
- One origin: `pages/` (`_routes.json`, base `_headers`, `_redirects`), `assemble` (a frontend's build
  output plus `pages/`, the build's Content-Security-Policy lifted into one `_headers` line, checked
  against Pages' `_headers` limits), `start` and `dev`, which end their whole process tree.
- Gates without Docker or an account: `wrangler types --check` (independent of a local env file),
  `tsc`, ESLint import zones proved by a boundary test, Prettier, and vitest in `workerd`.
- The `jobs` flag (off by default): `workers/jobs/` with a scheduled cleanup of expired rate-limit
  rows.
- No accounts (ADR 0014): no `auth` flag.
