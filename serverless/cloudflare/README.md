# serverless/cloudflare

An API that runs as one Cloudflare Worker with static assets, routed by Hono: D1 through Drizzle, zod
schemas that validate requests and produce the OpenAPI contract, one error envelope, tests in
`workerd`. No process, no Docker anywhere: generation, gates and the local database run without it,
and no account is needed. The shape is [ADR 0014](../../docs/adr/0014-astro-cloudflare-pages.md)
(K1, K2, T1) as [ADR 0016](../../docs/adr/0016-one-worker-with-static-assets.md) changed it. Generated
alone (`--template serverless/cloudflare`, in `serverless/cloudflare/`) or as the API of a stack with
a frontend; it is then the plan's server for everything the frontend keys on.

This version (2.0.0) has no accounts (every endpoint is public) and no `auth` flag.

## Layout

- `template.yaml`: the manifest (kind `serverless`, commands, the HTTP surface, the `jobs` flag,
  `contract: { produces: openapi.json }`).
- `base/`: the files copied into the generated package, including `AGENTS.md` (the layer map, the
  request flow, the import rules and the rules for entities that can move out, the contract,
  `static/` and `assemble`, the deployment by a person, "Moving from Pages Functions", "Scaling out"
  and the migration of an existing Pages site), the committed `openapi.json` and `bun.lock`.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `jobs`, `two-templates`,
  `sdk`).

## What a generated package is

Behind `/api`: `GET /api/health`, `GET /api/health/ready` (pings D1) and the reference entity
(`/api/entity`, `/api/entity/{id}`) that `base/AGENTS.md › Adding an entity` tells the reader to copy.

- **Request flow.** `server/index.ts` is the Worker's export; `server/server.ts` mounts each entity's
  `routes.ts` (a Hono router: gates, validation, controller call) at `/api/<name>` under the root
  middleware (request id, error envelope, response headers, one JSON log line), on `/api/*` only. A
  path outside `/api` is the platform's: `run_worker_first` is `["/api/*"]`. Hono is imported by
  those files and `middleware/handler.ts`; `server/` otherwise uses `Request`, `Response` and the
  bindings type.
- **Entities that can move out.** An entity imports another only through its controller; a rule it
  exports for another is async and takes and returns plain data; entities share no memory; each
  router is tested mounted alone. `AGENTS.md › Scaling out` is the recipe.
- **Contract.** `server/api/<entity>/schema.ts` holds the zod schemas and the entity's OpenAPI
  registration; `bun run openapi` writes `openapi.json` (3.1, `@asteasolutions/zod-to-openapi`, the
  same conventions as `server/bun-express`); a unit test fails when it is stale.
- **Data.** Drizzle on D1, SQL migrations in `migrations/`, rate-limit counters in a table hit by one
  upsert per check.
- **One origin.** `bun run assemble` builds `dist/` from a frontend's build output and `static/`,
  checks that every page's own policy `<meta>` allows only `'self'` and hashes for scripts and
  styles, and adds one fixed Content-Security-Policy line to `dist/_headers` (what a meta cannot
  carry: `frame-ancestors` and the rest; no hashes, so any number of pages fits); `bun run start`
  assembles, then serves `dist/` as the assets of `wrangler dev` on port 8788 and the e2e state
  folder. `bun run dev` serves the API alone on the same port.
- **Several frontends.** Beside more than one frontend, `assemble` puts each build in
  `dist/<dir>/` (`--only <dir>` builds one), every request runs the Worker, and `FRONTEND_HOSTS`
  (`<dir>.localhost=<dir>` locally, set by a deployer elsewhere) maps the host to the folder: an
  unnamed host is a 404, `/api/*` answers on every host. `/api/admin` (every plan, one gate that
  refuses until the product writes its own) answers on the `admin` frontend's host alone.
- **Gates.** `bun run check`: `wrangler types --check`, `tsc`, ESLint (import zones proved by a
  boundary test), Prettier and every test. `bun run test:db` runs the `workerd` API project alone,
  on the Worker's own entry.
- **`jobs` flag (off).** A cron trigger and a `scheduled` handler in the same Worker that delete
  expired rate-limit rows.

## With an SDK

When the plan holds an `sdk` package ([ADR 0020](../../docs/adr/0020-sdk-kind.md); generate with
`--sdk <dir>=<template>`), the Worker also serves it. Without one none of this exists in the
generated package.

- `/api/sdk/v1/`: the public, cross-origin namespace, `server/api/sdk/<entity>/`. One gate runs first:
  CORS for the namespace alone (the origin is echoed when the key lists it; never credentials), the
  `X-Sdk-Key` key, then a rate limit by key and by address. `GET /api/sdk/v1/config` answers
  `{ enabled }`, the kill switch.
- `GET|HEAD /api/sdk/dist/v<major>/<file>.js`: the SDK's build, with no key and a five-minute cache.
- `GET /api/sdk/frame/v<major>?k=<key>`: the frame document, framed only by the key's origins.
- `assemble` puts the SDK's build under `dist/api/sdk/`. The Worker answers every `/api/*` request
  before the platform's assets, fetches those files through `ASSETS` and writes its own headers, so a
  `_headers` rule never reaches them and none is served raw. `SDK_DIR` names another build.
- Variables: `SDK_KEYS` (`key=origin,origin;key=origin`; unset refuses every request) and
  `SDK_ENABLED` (default `true`), in `vars` of `wrangler.jsonc` once deployed.

## Versions

Wrangler 4, Hono 4, Vitest 4 with `@cloudflare/vitest-plugin`, Drizzle ORM 0.45 and drizzle-kit 0.31,
zod 4, zod-to-openapi 9, ESLint 10, TypeScript 6.
