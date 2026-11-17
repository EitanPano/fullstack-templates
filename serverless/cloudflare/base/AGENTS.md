# Serverless API

The layer map of the functions package: an API that runs as Cloudflare Pages Functions, with D1
through Drizzle and an OpenAPI contract. What holds for the whole repository (versions, commands,
definition of done) is in the repository's root `AGENTS.md`; nothing here repeats it. This file
ships with the package and an agent working in it loads it.

## Layer map

| Path                       | What it is                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `functions/`               | File path = route. `_middleware.ts` wraps every function; a route file is its gate chain and the call to a controller, nothing else             |
| `server/api/<module>/`     | `schema.ts` (zod, the contract's leaf, and the module's OpenAPI registration), `controller.ts` (rules and HTTP handlers), `service.ts` (queries), `model.ts` (its Drizzle table) |
| `server/middleware/`       | `handler.ts` (`handle`, `Context`, `Gate`, `rootMiddleware`), `validate`, `rate-limit` and `rate-limit-cleanup`, `error-handler`, `request-id`, `request-log`, `body` |
| `server/config/`           | `env.ts` (the bindings as validated configuration), `constants.ts` (policy)                                                                     |
| `server/models/<name>/`    | `interface.ts`, `type.ts`, `enum.ts`, `constants.ts` of one entity                                                                              |
| `server/services/`         | `logger.ts`, `security/crypto.ts`, `utils/` (pure: time, pagination, error, encoding, client address, zod, openapi helpers)                     |
| `server/infra/`            | `bindings.ts` (the typed bindings), `db.ts` (Drizzle over `DB`), `tables.ts` (the rate-limit table)                                             |
| `server/openapi.ts`        | Builds the OpenAPI document from every module's `schema.ts`; only `scripts/openapi.ts` and the tests import it                                  |
| `pages/`                   | What the platform reads beside the built site: `_routes.json`, the base `_headers`, `_redirects`                                                |
| `migrations/`              | SQL from `drizzle-kit generate`, applied by `bun run migrate`                                                                                   |
| `scripts/`                 | `openapi.ts`, `assemble.mjs`, `dev.mjs`, `start.mjs`, `e2e-db.mjs`; `lib/` holds their logic                                                    |
| `tests/`                   | `api/` (workerd, through the real routing), `unit/` (Node: pure code, the lint boundaries, the config files, the contract, `assemble`, `start`) |
| `openapi.json`             | The committed contract; a frontend generates its client from it                                                                                 |
| `wrangler.jsonc`, `worker-configuration.d.ts`, `drizzle.config.ts`, `tsconfig.json`, `.env.example` | platform and tool configuration                                       |

`server/` uses only the web platform's `Request` and `Response` and the bindings type: it imports no
Pages type, so a move to Workers replaces `functions/` and `pages/_routes.json` only. Environment
values come from the request's bindings, validated once per isolate in `server/config/env.ts`;
nothing reads `process.env` (lint) and nothing keeps a connection at module level.

There are no accounts: every endpoint is public. A product's own gate (for example Cloudflare
Access in front of an admin path) goes in the gate chain of the route that needs it.

## Request flow

`functions/_middleware.ts` runs `rootMiddleware` around every function: it gives the request an
id (honouring a well-formed `x-request-id`), turns a thrown error into the envelope, sets the
response headers (`x-request-id`, `x-content-type-options: nosniff`, `referrer-policy`,
`cache-control: no-store` unless the handler set one) and writes one JSON log line (method, path
without the query, status, duration, request id). A static page never reaches it:
`pages/_routes.json` includes `/api/*` only, and a `_headers` file never covers a Function's
response.

A route file exports `onRequest<Method> = handle(...gates, controller)` and
`onRequest = methodNotAllowed(...methods)`; an unknown `/api/*` path falls to
`functions/api/[[path]].ts` (the `not_found` envelope).

```ts
// functions/api/module/index.ts
export const onRequestGet = handle(validate(listModuleRequest), listModule)
export const onRequestPost = handle(
  rateLimit({ name: 'createModulePerIp', ...RATE_LIMITS.createModulePerIp, key: byIp }),
  validate(createModuleRequest),
  createModule,
)
export const onRequest = methodNotAllowed('GET', 'POST')
```

- **`Context`** (`middleware/handler.ts`), one object per request, passed to every gate and the
  controller: `request`, `url`, `env` (the validated configuration), `bindings` (the raw platform
  bindings), `db` (Drizzle over `DB`), `params`, `input`, `requestId`, `log` (bound to the request
  id) and `waitUntil`.
- **A gate** is `(ctx) => void | Response | Promise<...>`. It throws an `AppError` to refuse,
  returns a `Response` to answer in place of the controller (the rest of the chain is skipped), or
  returns nothing to continue. A gate fills a slot it owns: `validate` sets `ctx.input`. A gate
  that identifies the caller adds one `caller` field to `Context` and sets it.
- **A controller** is `(ctx) => Response | Promise<Response>`. It reads the validated input with
  `readInput(ctx, <operation>Request)`, throws an `AppError` for a refusal, and answers with
  `json(body, status)` or `noContent()`.
- Order: rate limit, then `validate`, then the controller. A 429 does not wait for parsing and a
  controller never sees unparsed input.

## Import direction

Enforced by `eslint.config.mjs` (deny zones, so a new file is constrained by default) and proved
by `tests/unit/boundaries.test.ts`; each message names the layer to use instead.

- `functions/` imports controllers, schemas, `server/middleware/` and `server/config/`. Nothing
  imports `functions/`.
- Inside `server/`: `models/` is a leaf; `config/` imports nothing of `server/`; `services/utils/`
  is pure; `services/` never imports `middleware/` or `api/`; `infra/` imports `config/` and
  `models/` only; `middleware/` never imports `api/`.
- `schema.ts` is the leaf of its module: it imports `models/`, `services/utils/` and
  `config/constants` only. `server/openapi.ts` imports every `schema.ts` and `services/utils/`; the
  request path never imports it.
- A module's `service.ts` and `model.ts` are imported only inside that module, and the data layer
  never imports `middleware/` (it never sees HTTP). Another module is reached through its
  `controller.ts` only, from a `controller.ts`.
- `functions/` and `server/` import each other by relative path: the platform's function bundler
  resolves aliases from the root `tsconfig.json` only, and there is no alias.
- Not enforced (review): a route file holds nothing but gates and one controller call; a rule
  another module needs is an exported typed function of the controller, never a handler.

## Commands

`bun run check` is every gate and needs no Docker or account: `wrangler types --check`, `tsc` on
the server and the tests, `eslint`, `prettier --check`, then every test (the contract freshness test
among them). `bun run test:db` runs the API project alone. After a `wrangler.jsonc` change run
`bun run types`: the generated types embed its values. The types commands name `types-vars.txt`
as the only env file, so a developer's local env file cannot change the generated `Env` and
`typecheck` answers the same on every machine; keep that file empty.

| Command               | What it does                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `bun run migrate`     | Applies the migrations to the development database (`.wrangler/state`)                                    |
| `bun run dev`         | `wrangler pages dev` on port __PORT__: the functions alone; a frontend's dev server proxies `/api` to it   |
| `bun run assemble`    | Builds `dist/` from the frontend's build output and `pages/` (see Pages and assemble)                      |
| `bun run e2e:db`      | Rebuilds `.e2e-state` from nothing and migrates it                                                        |
| `bun run start`       | `assemble`, then `wrangler pages dev dist` once on `.e2e-state`, port __PORT__; `RATE_LIMIT_SCALE` and `LOG_LEVEL` come from the shell |
| `bun run openapi`     | Writes `openapi.json` (the `contract` command)                                                            |
| `bun run db:generate` | `drizzle-kit generate`: SQL from the models into `migrations/`                                             |

An e2e run is `bun run e2e:db` then `bun run start` with `RATE_LIMIT_SCALE=100`; it answers
`/api/health` within a few seconds of the build existing. Never leave it running: end the whole
process tree (on Windows ending the `bun run` shell leaves wrangler and workerd alive).

## Contract

`bun run openapi` writes `openapi.json` (OpenAPI 3.1, servers `/`) from the same zod schemas that
validate requests, with `@asteasolutions/zod-to-openapi`, in Bun and outside the runtime. Each
module registers its paths in a `register<Name>` function at the bottom of its `schema.ts`; one line
per module in `server/openapi.ts` lists it. Paths are singular, tags are the module name, every
failure is the `ErrorBody` envelope (`errorResponses(400, 404, ...)`), and an operation has no
hand-written id: a frontend's client names the calls from method and path. The file is committed;
`tests/unit/openapi.test.ts` fails when it is stale (run `bun run openapi`) and when a documented
operation has no route file. A frontend's `contract` command reads it.

## Pages and assemble

One Pages project serves the built site and the functions on one origin. `pages/` holds what the
platform reads beside the site, and `scripts/assemble.mjs` builds `dist/` from it:

<!-- @frontend-start -->
1. The frontend's built output directory (`__FRONTEND_PATH__/__FRONTEND_OUT__`, fixed when the
   package is generated beside a frontend; `--frontend <dir>` overrides it) is copied into `dist/`.
<!-- @frontend-end -->
<!-- @nofrontend-start -->
1. The frontend's built output directory (none was in the plan, so only `--frontend <dir>` names
   one; a frontend added later sets it in `scripts/assemble.mjs`) is copied into `dist/`.
<!-- @nofrontend-end -->

2. `pages/`'s files are laid over it. `_headers` and `_redirects` are merged, the frontend's lines
   first; `_routes.json` replaces the frontend's.
3. The Content-Security-Policy a build wrote into each page's `<meta http-equiv>` is lifted into one
   `Content-Security-Policy` line under `/*` of `dist/_headers` (`default-src 'self'`,
   `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`,
   `connect-src 'self'`, `img-src 'self' data:`, `font-src 'self'` and the build's hashed
   `script-src` and `style-src`), and the metas are removed. A page with no meta is served under the
   same header; a build with no meta gets no line.

It fails, naming the cause, when the frontend's output is missing ("build the frontend first"),
when pages carry policies that cannot be merged (different directives or sources besides hashes,
`'unsafe-inline'`), when a `_headers` file already sets a policy, and when the result is over the
platform's limits for `_headers`: 100 rules and 2,000 characters per line
(developers.cloudflare.com/pages/configuration/headers). It builds beside `dist/` and swaps, so a
failed run leaves the previous `dist/`. Without a frontend in the plan `dist/` holds `pages/`'s
files only.

`pages/_routes.json` sends only `/api/*` to the functions, so a static page invokes none. Never put
a Content-Security-Policy in `pages/_headers` (the hashes change every build). A frontend's own
`public/_headers` and `_redirects` pass through its build into the merge.

## Adding a module

Work in this order, test first.

1. `server/models/<name>/`: `interface.ts` (the stored record), `type.ts` (public shape, inputs),
   `enum.ts`, `constants.ts` (limits).
2. `server/api/<name>/schema.ts`: the zod schemas, each `satisfies z.ZodType<...>` of its
   `models/` type, one `<operation>Request` object per endpoint (only the parts it reads), and
   `register<Name>`; add it to `server/openapi.ts`.
3. `tests/api/<name>.test.ts`, red (see Tests).
4. `server/api/<name>/model.ts` (the table), then `bun run db:generate -- --name <name>` and
   `bun run migrate` (see Adding the data layer).
5. `service.ts`: queries taking `db` as their first parameter.
6. `controller.ts`: one handler per endpoint, then the rules other modules need.
7. `functions/api/<name>/index.ts` and `[id].ts`: the gate chain and the controller call, plus
   `onRequest = methodNotAllowed(...)`. Add the table of a new module to `drizzle.config.ts` only
   if it is outside `server/api/*/model.ts`.
8. `bun run openapi`, then `bun run check`; commit `openapi.json` and the migration.

Start by copying `server/api/module/`, `server/models/module/`, `functions/api/module/` and
`tests/api/module.test.ts`, renaming `module` to `<name>`, `Module` to `<Name>`. Drop the reference
module (those paths, its line in `server/openapi.ts` and its migration's table) once a real one
exists.

- One request object, two readers: `validate(<operation>Request)` in the route file and
  `readInput(ctx, <operation>Request)` in the handler.
- A list paginates: `PageQuery` and `pageOf` from `services/utils/pagination.ts`, the service
  fetches `limit + 1` rows and `toPage` slices, the cursor is opaque. Paths are singular
  (`/api/post`, `/api/post/{id}`), bodies JSON only. Statuses: 200 read and update, 201 create (the
  created resource), 204 delete (no body), 400 validation, 404 missing, 405 wrong method, 409
  conflict, 429 rate limited.
- Ids are made in the controller (`crypto.randomUUID()`).
- The migration recipe for an existing hand-written Pages site (a `_lib` folder, hand-migrated
  database) is completed by a later release of this template.

## Adding the data layer

D1 through Drizzle is part of the base. A table is `server/api/<module>/model.ts`; the platform
layers' own tables are `server/infra/tables.ts`.

- Timestamps are `integer({ mode: 'timestamp_ms' })` columns (epoch milliseconds, read back as
  `Date`). Table and column names are snake_case singular, fields camelCase in code.
- `bun run db:generate -- --name <name>` writes the SQL into `migrations/`; commit it with the
  model. Never edit an applied migration: add a new one. `bun run migrate` applies it locally.
- D1 has no interactive transaction. A rule that must not race is one conditional statement
  (`UPDATE ... WHERE ... RETURNING`, an upsert) or one `db.batch([...])`. The rate limiter is one
  upsert with `RETURNING count`.
- A query takes the `db` of the context. `infra/db.ts` builds the client from the request's `DB`
  binding; nothing is cached at module level.
- Remote databases are created and migrated by a person with `wrangler d1`; no script of the
  template does it. `wrangler.jsonc` names a separate database per Pages environment, with fake ids
  to replace.

## Errors

Every non-2xx response is the one envelope, built in `server/middleware/error-handler.ts` and
nowhere else:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "invalid body",
    "details": [{ "path": "name", "message": "..." }]
  },
  "requestId": "..."
}
```

- A handler throws `new AppError(code, message, details?, { headers? })`; `code` maps to a status
  (`server/services/utils/error.ts`): `validation_failed` 400, `unauthenticated` 401, `forbidden`
  403, `not_found` 404, `method_not_allowed` 405 (with `Allow`), `conflict` 409,
  `payload_too_large` 413, `unsupported_media_type` 415, `rate_limited` 429 (with `Retry-After`),
  `internal` 500, `upstream_unavailable` 503. `method_not_allowed` is the one code beyond
  `server/bun-express`'s, because Pages routes by file and answers a missing method itself.
- A ZodError that escapes is a 400. Anything else is logged with its stack and leaves as a bare
  `internal` envelope: no message, stack or query text reaches the client.
- Only a 401 for a request with no valid access token carries `WWW-Authenticate: Bearer`
  (`authenticationRequired()`); every other 401 carries none.
- Logging is `ctx.log` (one JSON line per call; a field whose key looks secret prints
  `[redacted]`). Never put a header, a body or a secret in a field.
- Health: `GET /api/health` (no store) and `GET /api/health/ready` (pings D1, 503 with the map).

## Tests

`bun run test` runs two vitest projects. `unit` runs in Node (`tests/unit/`): pure code, the import
boundaries, `wrangler.jsonc`, the contract, the `assemble` step on fixture output and `start` on a
fixture build (it starts `wrangler pages dev` on port 8797 and ends it). `api` runs in workerd
(`tests/api/`, `bun run test:db`): a global setup builds the functions once
(`wrangler pages functions build`), and every test sends a request to that built worker, through
the real routing and the root middleware, against a D1 with the migrations applied. Bindings for the
run (`ENVIRONMENT: test`) are in `vitest.config.ts`.

- `tests/api/helpers.ts`: `send(path, { method, body, headers })` returns the `Response`;
  `json(response)` reads it; `through(handler, path, { bindings, params })` runs one handler built in
  the test under the root middleware, for what no route exercises (a probe that throws, a
  production environment, a broken database).
- Storage is isolated per test file, not per test: `tests/api/setup.ts` empties every table before
  each test. A new table needs nothing there.
- A test never starts a listener of its own (`start.test.ts` starts the real script) and never calls
  a remote binding. Tests first: write the failing test, see it red, then the code; each behaviour
  has a happy path and a failure or empty one. Never delete, skip or focus a test.

## Deployment

The target is Cloudflare Pages: one Pages project whose root directory is this package. Its build
command builds the frontend and runs `bun run assemble`; its output directory is `dist`. Pages
serves `dist/` and compiles `functions/` on one origin. `wrangler.jsonc` carries `ENVIRONMENT` and
a D1 binding for development, `preview` and `production` (Pages environments do not inherit
bindings, and the preview database differs from production's). No secret is in the file or in the
template; production secrets are set by a person, in the dashboard or with `wrangler secret`. Local
overrides go in a `.env` file (see `.env.example`); never create a `.dev.vars` beside it: where
that file exists, `.env` is ignored whole. No script of the template deploys, logs in or reaches a
remote binding, and an agent never runs `wrangler deploy`, `login`, `secret` or any command with
`--remote`. Not proven on a deployed project.

<!-- @jobs-start -->

## Jobs

The `jobs` flag adds `workers/jobs/`: a second Worker with its own `wrangler.jsonc` (its name is
`<project>-jobs`, the same D1 binding and database names per environment as the Pages project, one
cron trigger, no secret) and `index.ts`, one `scheduled` handler that runs the one job: deleting
expired rate-limit rows in bounded batches (`server/middleware/rate-limit-cleanup.ts`, the code the
request path also calls; the bound is `RATE_LIMIT_PURGE_MAX_BATCHES`). `tests/unit/jobs-config.test.ts`
asserts the two wrangler files agree and `tests/api/jobs.test.ts` calls the handler in workerd.
`workers/` may import what `functions/` may; nothing imports it.

Run it locally, on the database `bun run migrate` prepared (without `--persist-to` the Worker
keeps its own empty state under `workers/jobs/` and the query fails):
`wrangler dev --config workers/jobs/wrangler.jsonc --test-scheduled --persist-to .wrangler/state`,
then request `/cdn-cgi/handler/scheduled` on its port (8787 unless `--port` is given). There is no
deploy script: a person deploys the Worker with `wrangler deploy --config workers/jobs/wrangler.jsonc`.

<!-- @jobs-end -->
