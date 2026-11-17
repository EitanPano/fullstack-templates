# serverless/cloudflare

An API that runs as Cloudflare Pages Functions: D1 through Drizzle, zod schemas that validate requests
and produce the OpenAPI contract, one error envelope, tests in `workerd`. No process, no Docker
anywhere: generation, gates and the local database run without it, and no account is needed. The
shape is [ADR 0014](../../docs/adr/0014-astro-cloudflare-pages.md) (K1, K2, T1). Generated alone
(`--template serverless/cloudflare`, in `serverless/cloudflare/`) or as the API of a stack with a
frontend; it is then the plan's server for everything the frontend keys on.

This version (1.0.0) has no accounts (every endpoint is public) and no `auth` flag.

## Layout

- `template.yaml`: the manifest (kind `serverless`, commands, the HTTP surface, the `jobs` flag,
  `contract: { produces: openapi.json }`).
- `base/`: the files copied into the generated package, including `AGENTS.md` (the layer map, the
  request flow, the import rules, the contract, `pages/` and `assemble`, the recipes, the deployment
  by a person and the migration of an existing Pages site), the committed `openapi.json` and
  `bun.lock`.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `jobs`), each the template
  alone.

## What a generated package is

Behind `/api`: `GET /api/health`, `GET /api/health/ready` (pings D1) and the reference module
(`/api/module`, `/api/module/{id}`) that `base/AGENTS.md › Adding a module` tells the reader to copy.

- **Request flow.** `functions/_middleware.ts` runs the root middleware around every function
  (request id, error envelope, response headers, one JSON log line); a route file is its gate chain
  and one controller call; `server/` uses only `Request`, `Response` and the bindings type.
- **Contract.** `server/api/<module>/schema.ts` holds the zod schemas and the module's OpenAPI
  registration; `bun run openapi` writes `openapi.json` (3.1, `@asteasolutions/zod-to-openapi`, the
  same conventions as `server/bun-express`); a unit test fails when it is stale.
- **Data.** Drizzle on D1, SQL migrations in `migrations/`, rate-limit counters in a table hit by one
  upsert per check.
- **One origin.** `bun run assemble` builds `dist/` from a frontend's build output and `pages/`
  (`_routes.json` sends only `/api/*` to the functions) and lifts the build's Content-Security-Policy
  into `dist/_headers`; `bun run start` assembles, then serves `dist/` with `wrangler pages dev` on
  port 8788 and the e2e state folder. `bun run dev` serves the functions alone on the same port.
- **Gates.** `bun run check`: `wrangler types --check`, `tsc`, ESLint (import zones proved by a
  boundary test), Prettier and every test. `bun run test:db` runs the `workerd` API project alone.
- **`jobs` flag (off).** `workers/jobs/`: a second Worker with its own `wrangler.jsonc`, one cron
  trigger and one scheduled handler that deletes expired rate-limit rows.

## Versions

Wrangler 4, Vitest 4 with `@cloudflare/vitest-plugin`, Drizzle ORM 0.45 and drizzle-kit 0.31, zod 4,
zod-to-openapi 9, ESLint 10, TypeScript 6.
