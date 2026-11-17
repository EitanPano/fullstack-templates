# Serverless API

The layer map of the functions package: an API that runs as Cloudflare Pages Functions, with D1
through Drizzle and an OpenAPI contract. What holds for the whole repository (versions, commands,
definition of done) is in the repository's root `AGENTS.md`; nothing here repeats it. This file
ships with the package and an agent working in it loads it.

## Packages and conventions

- Shipped beyond the platform: `zod` (validation and the contract's source), `@asteasolutions/zod-to-openapi`
  (OpenAPI 3.1 from the schemas), `drizzle-orm` and `drizzle-kit` (D1 queries and SQL migrations).
  Dev: `wrangler`, `vitest` with `@cloudflare/vitest-plugin`, ESLint 10 with `import-x`,
  Prettier. Nothing else is added without a plan.
- TypeScript is pinned to `~6.0.3`: `typescript-eslint` peers below 6.1, and a frontend beside this
  package runs `astro check`, which refuses 7. Move it only with both.
- No accounts: every endpoint is public. A product's own gate (Cloudflare Access in front of an
  admin path, a token) goes in the gate chain of the route that needs it.
- Logging goes through `server/services/logger.ts` (one JSON line per call, a field whose key looks
  secret prints `[redacted]`); nothing else calls `console`.
- Files are kebab-case, entities are singular (`/api/post`, `server/api/post/`, table `post`),
  database columns are snake_case and code fields camelCase. The domain's own term names a module.
- Not a Node server: no `fs`, no listener, no module-level connection. `nodejs_compat` is on, which
  gives `node:crypto` and `node:buffer`; use the web platform first.

## Layer map

| Path                    | What it is                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functions/`            | File path = route. `_middleware.ts` wraps every function; a route file is its gate chain and the call to a controller, nothing else                                          |
| `server/api/<module>/`  | `schema.ts` (zod, the contract's leaf, and the module's OpenAPI registration), `controller.ts` (rules and HTTP handlers), `service.ts` (queries), `model.ts` (its Drizzle table) |
| `server/middleware/`    | `handler.ts` (`handle`, `Context`, `Gate`, `rootMiddleware`), `validate`, `rate-limit` and `rate-limit-cleanup`, `error-handler`, `request-id`, `request-log`, `body`        |
| `server/config/`        | `env.ts` (the bindings as validated configuration), `constants.ts` (policy)                                                                                                  |
| `server/models/<name>/` | `interface.ts`, `type.ts`, `enum.ts`, `constants.ts` of one entity                                                                                                           |
| `server/services/`      | `logger.ts`, `security/crypto.ts`, `utils/` (pure: time, pagination, error, encoding, client address, zod, openapi helpers)                                                  |
| `server/infra/`         | `bindings.ts` (the typed bindings), `db.ts` (Drizzle over `DB`), `tables.ts` (the rate-limit table)                                                                          |
| `server/openapi.ts`     | Builds the OpenAPI document from every module's `schema.ts`; only `scripts/openapi.ts` and the tests import it                                                              |
| `pages/`                | What the platform reads beside the built site: `_routes.json`, the base `_headers`, `_redirects`                                                                             |
| `migrations/`           | SQL from `drizzle-kit generate`, applied by `bun run migrate`; `meta/` is drizzle's own                                                                                      |
| `scripts/`              | `openapi.ts`, `assemble.mjs`, `dev.mjs`, `start.mjs`, `e2e-db.mjs`; `lib/` holds their logic                                                                                 |
| `tests/`                | `api/` (workerd, through the real routing), `unit/` (Node: pure code, the lint boundaries, the config files, the contract, `assemble`, `start`), `support/`                  |
| `openapi.json`          | The committed contract; a frontend generates its client from it                                                                                                              |
| `wrangler.jsonc`, `worker-configuration.d.ts`, `types-vars.txt`, `drizzle.config.ts`, `tsconfig.json`, `.env.example` | Platform and tool configuration. `worker-configuration.d.ts` is generated and committed; `types-vars.txt` is empty on purpose |
<!-- @jobs-start -->
| `workers/jobs/`         | The second Worker of the `jobs` flag: `index.ts` (one `scheduled` handler) and its own `wrangler.jsonc`                                                                      |
<!-- @jobs-end -->

`server/` uses only the web platform's `Request` and `Response` and the bindings type: it imports no
Pages type, so a move to Workers replaces `functions/` and `pages/_routes.json` only. Environment
values come from the request's bindings, validated once per isolate in `server/config/env.ts`;
nothing reads `process.env` (lint) and nothing keeps a connection at module level.

## Where does X go

| You are adding…                | It goes in                                                                 | Shape                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| An endpoint                    | `functions/api/<name>/index.ts` or `[id].ts` + `server/api/<name>/controller.ts` | one `onRequest<Method> = handle(...gates, controller)` line; one handler named after the operation; its `<operation>Request` in `schema.ts` |
| A resource with endpoints      | `server/api/<name>/`, `server/models/<name>/`, `functions/api/<name>/`     | copy the reference `module`; one line in `server/openapi.ts`; see Adding a module                                           |
| A request or response shape    | `server/api/<name>/schema.ts`                                              | zod, `satisfies` the `models/` type, with its `registerPath`                                                                |
| A table                        | `server/api/<name>/model.ts`                                               | then `bun run db:generate -- --name <name>` and `bun run migrate`; a table no module owns is `server/infra/tables.ts`        |
| A query                        | `server/api/<name>/service.ts`                                             | takes `db` first; private to the module                                                                                    |
| A business rule                | `server/api/<name>/controller.ts`                                          | in the handler; an exported typed function once another module, a job or a function outside `/api` needs it                |
| A gate (authorisation, a limit) | `server/middleware/<name>.ts`, chained in the route file                   | `(ctx) => void \| Response`; throws an `AppError` to refuse; never imports `api/`                                           |
| A policy constant              | `server/config/constants.ts`                                               | durations, limits, batch sizes                                                                                              |
| A limit on an entity's field   | `server/models/<name>/constants.ts`                                        | lengths and ranges of the data                                                                                              |
| An environment variable        | `server/config/env.ts` + `.env.example`                                    | in the zod schema; a secret is optional until a feature needs it, has no default, and is invalid when set wrongly                         |
| A platform binding             | `wrangler.jsonc` in every environment, then `bun run types`                | an accessor in `server/infra/bindings.ts`; see Migrating Pages Functions, step 5                                            |
| A secret                       | the Pages dashboard per environment, `config/env.ts`, `.env.example`       | a person sets it; locally it is a line of `.env` (see Deployment)                                                           |
| A redirect                     | the frontend's `public/_redirects`; `pages/_redirects` with no frontend    | `/old /new 301`; the two files merge in `assemble`                                                                           |
| A static header                | the frontend's `public/_headers`, or `pages/_headers`                      | never set or detach the Content-Security-Policy; a Function's response takes its headers from `rootMiddleware` or its controller          |
| A function route outside `/api` | `functions/<path>.ts` + a line in `pages/_routes.json`                    | see Migrating Pages Functions, step 4                                                                                       |
| A pure helper                  | `server/services/utils/<name>.ts`                                          | no I/O, no state                                                                                                            |
| A shared capability with state | `server/services/<name>.ts`                                                | logging, security primitives; stateful means per request, never module level                                                |
| A scheduled job                | `workers/jobs/index.ts` + its logic as an exported rule of a controller   | with the `jobs` flag only; see Jobs | <!-- @jobs -->

## Request flow

`functions/_middleware.ts` runs `rootMiddleware` around every function: it gives the request an
id (honouring a well-formed `x-request-id`), turns a thrown error into the envelope, sets the
response headers (`x-request-id`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`,
`cache-control: no-store` unless the handler set one) and writes one JSON log line (method, path
without the query, status, duration, request id). A static page never reaches it:
`pages/_routes.json` includes `/api/*` only, and a `_headers` file never covers a Function's
response.

The whole flow: `functions/_middleware.ts → route file → gates → validate → controller → service →
Drizzle → D1`. A route file exports `onRequest<Method> = handle(...gates, controller)` and
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
  returns nothing to continue. A gate fills a slot it owns: `validate` sets `ctx.input`.
- **A controller** is `(ctx) => Response | Promise<Response>`. It reads the validated input with
  `readInput(ctx, <operation>Request)`, throws an `AppError` for a refusal, and answers with
  `json(body, status)` or `noContent()`.
- Order: rate limit, then `validate`, then the controller. A 429 does not wait for parsing and a
  controller never sees unparsed input. Every mutation (POST, PATCH, DELETE) carries its own
  `rateLimit` gate.

## Import direction

Enforced by `eslint.config.mjs` (deny zones, so a new file is constrained by default) and proved
by `tests/unit/boundaries.test.ts`; each message names the layer to use instead.

| Layer (the importer)       | May import                                                                                 | Never                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `functions/`, `workers/`   | controllers, schemas, `server/middleware/`, `server/config/`                               | `services/`, `infra/`, `models/` directly; each other; `openapi.ts` |
| `server/models/`           | `models/` only                                                                             | every other layer                                                  |
| `server/config/`           | nothing of `server/`                                                                       | every other layer                                                  |
| `server/services/utils/`   | `models/`, `config/`, `services/utils/`                                                    | `logger`, `security/`, `middleware/`, `infra/`, `api/`             |
| `server/services/`         | `models/`, `config/`, `services/`                                                          | `middleware/`, `api/`                                              |
| `server/infra/`            | `config/`, `models/`                                                                       | `middleware/`, `api/`, `services/`                                 |
| `server/middleware/`       | `config/`, `infra/`, `services/`, `models/`                                                | `api/`                                                             |
| `api/<m>/schema.ts`        | `models/`, `services/utils/`, `config/constants`                                           | everything else (it is the leaf)                                   |
| `api/<m>/service.ts`, `model.ts` | `models/`, `infra/`, `services/`, `config/`                                          | `middleware/`, another module                                      |
| `api/<m>/controller.ts`    | its module, `middleware/`, `services/`, `config/`, `models/`, another module's `controller.ts` | another module's `service.ts` or `model.ts`                    |
| `server/openapi.ts`        | every `schema.ts`, `services/utils/`                                                       | everything else; the request path never imports it                 |

- A module's `service.ts` and `model.ts` are imported only inside that module. Another module is
  reached through its `controller.ts` only, from a `controller.ts`.
- `functions/` and `server/` import each other by relative path: the platform's function bundler
  resolves aliases from the root `tsconfig.json` only, and there is no alias.
- `process.env` is refused in `server/`, `functions/` and `workers/`; read the validated `ctx.env`.
- Not enforced (review): a route file holds nothing but gates and one controller call; a rule
  another module needs is an exported typed function of the controller, never a handler.

## Commands

`bun run check` is every gate and needs no Docker or account: `wrangler types --check`, `tsc` on
the server and the tests, `eslint`, `prettier --check`, then every test (the contract freshness test
among them). `bun run test:db` runs the API project alone. After a `wrangler.jsonc` change run
`bun run types`: the generated types embed its values. The types commands name `types-vars.txt`
as the only env file, so a developer's local env file cannot change the generated `Env` and
`typecheck` answers the same on every machine; keep that file empty.

| Command               | Meaning                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check`       | Every gate (`typecheck`, `lint`, `format:check`, `test`)                                                                                  |
| `bun run typecheck`   | `wrangler types --check`, then `tsc` on the package and on `tests/`                                                                       |
| `bun run lint`, `format` | ESLint with the import zones; Prettier (`format:check` is the gate, `format` rewrites)                                                  |
| `bun run test`        | Both vitest projects: `unit` (Node) and `api` (workerd)                                                                                   |
| `bun run test:db`     | The `api` project alone (the `testDb` command)                                                                                            |
| `bun run types`       | Regenerates `worker-configuration.d.ts` from `wrangler.jsonc`                                                                             |
| `bun run migrate`     | Applies the migrations to the development database (`.wrangler/state`)                                                                    |
| `bun run db:generate` | `drizzle-kit generate`: SQL from the models into `migrations/`                                                                            |
| `bun run dev`         | `wrangler pages dev` on port __PORT__: the functions alone; a frontend's dev server proxies `/api` to it                                  |
| `bun run assemble`    | Builds `dist/` from the frontend's build output and `pages/` (see Pages and assemble)                                                     |
| `bun run e2e:db`      | Rebuilds `.e2e-state` from nothing and migrates it (the `e2eDb` command)                                                                  |
| `bun run start`       | `assemble`, then `wrangler pages dev dist` once on `.e2e-state`, port __PORT__; `RATE_LIMIT_SCALE` and `LOG_LEVEL` come from the shell    |
| `bun run openapi`     | Writes `openapi.json` (the `contract` command)                                                                                            |

The scripts find the package from their own location, so they agree wherever they are started. An
e2e run is `bun run e2e:db` then `bun run start` with `RATE_LIMIT_SCALE=100`; it answers
`/api/health` within a few seconds (allow 8 s or more on a loaded machine) once the frontend's build
exists. Never leave it running: end the whole process tree (on Windows ending the `bun run` shell
leaves wrangler and workerd alive; the scripts end their own tree on SIGINT and SIGTERM). The
development state (`.wrangler/state`) and the e2e state (`.e2e-state`) never meet.

## Contract

`bun run openapi` writes `openapi.json` (OpenAPI 3.1, servers `/`) from the same zod schemas that
validate requests, with `@asteasolutions/zod-to-openapi`, in Bun and outside the runtime. Each
module registers its paths in a `register<Name>` function at the bottom of its `schema.ts`; one line
per module in `server/openapi.ts` lists it. Paths are singular, tags are the module name, every
failure is the `ErrorBody` envelope (`errorResponses(400, 404, ...)`), and an operation has no
hand-written id: a frontend's client names the calls from method and path. The file is committed;
`tests/unit/openapi.test.ts` fails when it is stale (run `bun run openapi`), when a documented
operation has no route file and when a path is documented outside `/api`. A frontend's `contract`
command reads it.

## Pages and assemble

One Pages project serves the built site and the functions on one origin. `pages/` holds what the
platform reads beside the site, and `scripts/assemble.mjs` builds `dist/` from it. `assemble` never
builds the frontend: a missing or empty output fails with "the frontend's output <path> is missing
or empty: build the frontend first".

<!-- @frontend-start -->
1. The frontend's built output directory (`__FRONTEND_PATH__/__FRONTEND_OUT__`, fixed when the
   package is generated beside a frontend; `--frontend <dir>` overrides it) is copied into `dist/`.
   It must hold `index.html` at its root and one policy `<meta>` per page (an Astro build with
   `security.csp`), and carry its own `_headers` and `_redirects` through its `public/`, with the
   `/_astro/*` immutable cache rule in its own `_headers` (that rule is framework-specific, so
   `pages/_headers` does not carry it) and no `Content-Security-Policy` line, and no
   `! Content-Security-Policy` detach line, in any `_headers`. `--out <dir>` builds somewhere other
   than `dist/`; a relative path is relative to this package.
<!-- @frontend-end -->
<!-- @nofrontend-start -->
1. The frontend's built output directory (none was in the plan, so only `--frontend <dir>` names
   one; a frontend added later sets it in `scripts/assemble.mjs`) is copied into `dist/`.
<!-- @nofrontend-end -->
2. `pages/`'s files are laid over it. `_headers` and `_redirects` are merged, the frontend's lines
   first; `_routes.json` replaces the frontend's.
3. Two policies apply to every page, and a browser enforces both. The page's own `<meta
   http-equiv="content-security-policy">` stays in the page, untouched: it carries that page's
   script and style hashes (they change every build). `assemble` adds one fixed line under the
   first `/*` rule of `dist/_headers` (creating the rule when there is none) with what a meta
   cannot carry: `frame-ancestors 'none'`, `base-uri`, `object-src 'none'`, `form-action`,
   `connect-src`, `img-src 'self' data:`, `font-src`, `media-src`, `frame-src`, `worker-src` and
   `manifest-src`. The line has no hash and no `default-src`, `script-src` or `style-src`, so it
   never blocks what the meta allows and no page accepts another page's hashes.

`assemble` fails, naming the cause and the file, when a page's meta allows anything in
`script-src` or `style-src` (or `default-src` where those are absent) other than `'self'`, a hash
or `'strict-dynamic'` (`'unsafe-inline'`, `'unsafe-eval'`, `'unsafe-hashes'`, a nonce, a host, a
scheme, `*`; compared in lower case; other directives in the meta are allowed, they only tighten),
when a `_headers` file of the frontend or of `pages/` sets or detaches `Content-Security-Policy`,
when the frontend's output or `pages/` holds a symbolic link, and when the merged `_headers` is
over the platform's limits: 100 rules and 2,000 characters per line (the fixed line is far below).
A page with no policy meta (a file copied from the frontend's `public/`) is served as it is, under
the fixed header only; `assemble` prints one warning to stderr with the count and up to ten paths
("served without a script policy"), and succeeds. It builds beside `dist/` and swaps, so a failed
run leaves the previous `dist/`. Without a frontend in the plan `dist/` holds `pages/`'s files
only.

`pages/_routes.json` sends only `/api/*` to the functions, so a static page invokes none and has no
request id; `/api/*` always has one. An unknown `/api/x` answers the JSON `not_found` envelope; an
unknown page answers the frontend's 404 page with status 404. Never put a Content-Security-Policy in
`pages/_headers`, and never detach it: `assemble` refuses both.

## Adding a module

Work in this order, test first. The reference module is the example to copy: `server/api/module/`,
`server/models/module/`, `functions/api/module/` and `tests/api/module.test.ts`, renaming `module`
to `<name>`, `Module` to `<Name>`. Drop the reference module (those paths, its line in
`server/openapi.ts` and its table) once a real one exists, in a migration that drops the table.

1. `server/models/<name>/`: `interface.ts` (the stored record), `type.ts` (public shape, inputs),
   `enum.ts`, `constants.ts` (limits).
2. `server/api/<name>/schema.ts`: the zod schemas, each `satisfies z.ZodType<...>` of its
   `models/` type; one `<operation>Request` object per endpoint (only the parts it reads: `body`,
   `query`, `params`); and `register<Name>(registry)` with a `registerPath` per endpoint. Add
   `register<Name>` to the list in `server/openapi.ts`.
3. `tests/api/<name>.test.ts`, red (see Tests).
4. `server/api/<name>/model.ts` (the table), then `bun run db:generate -- --name <name>` and
   `bun run migrate` (see Adding the data layer).
5. `service.ts`: queries taking `db` as their first parameter.
6. `controller.ts`: one handler per endpoint, then the rules other modules need.
7. `functions/api/<name>/index.ts` and `[id].ts`: the gate chain and the controller call, plus
   `onRequest = methodNotAllowed(...)`. A list route is `validate(list<Name>Request)`; a write is
   `rateLimit(...)` then `validate(...)`. A table in a file other than `server/api/*/model.ts` goes
   in `drizzle.config.ts`'s `schema`.
8. `bun run openapi`, then `bun run check`; commit `openapi.json` and the migration.

- One request object, two readers: `validate(<operation>Request)` in the route file and
  `readInput(ctx, <operation>Request)` in the handler.
- A list paginates: `PageQuery` and `pageOf` from `services/utils/pagination.ts`, the service
  fetches `limit + 1` rows and `toPage` slices, the cursor is opaque. Paths are singular
  (`/api/post`, `/api/post/{id}`), bodies JSON only. Statuses: 200 read and update, 201 create (the
  created resource), 204 delete (no body), 400 validation, 404 missing, 405 wrong method, 409
  conflict, 429 rate limited.
- Ids are made in the controller (`crypto.randomUUID()`), never by the database or the client.
- A rate limit is a gate (`rateLimit({ name, limit, window, key })`) with its numbers in
  `RATE_LIMITS`; `byIp` keys an IPv6 address by its /64 network. Every mutation carries one, with
  its own name and counter (`createModulePerIp`, `updateModulePerIp`, `deleteModulePerIp`).

## Adding the data layer

D1 through Drizzle is part of the base. A table is `server/api/<module>/model.ts`; the platform
layers' own tables are `server/infra/tables.ts`. `drizzle.config.ts` reads both.

- **Adding a table.** Write the `sqliteTable` in the module's `model.ts`, run
  `bun run db:generate -- --name <name>` (SQL lands in `migrations/`; commit it with the model), then
  `bun run migrate`. Never edit an applied migration: add a new one.
- **Ids and timestamps.** Ids are `text` (a UUID made in the controller). Timestamps are
  `integer({ mode: 'timestamp_ms' })` columns (epoch milliseconds, read back as `Date`). Table and
  column names are snake_case singular, fields camelCase in code. Index names say what they cover
  (`module_created_at_id_idx`).
- **No interactive transaction.** D1 offers none, so a rule that must not race is one of three
  patterns: a conditional statement (`UPDATE ... WHERE <still true> ... RETURNING`: no row back means
  the condition failed); an upsert (`insert ... onConflictDoUpdate ... returning`, as the rate limiter
  does with `RETURNING count`); or `db.batch([...])`, which runs its statements in one implicit
  transaction and counts as one query of the invocation's budget.
- **Limits that bite.** 100 bound parameters per query (a bulk insert is chunked), 50 queries per
  invocation on the free plan and 1,000 on the paid one, 2 MB per row (platform limits, checked
  2026-11-17 at developers.cloudflare.com/d1/platform/limits).
- **Expiry.** A row that expires carries an `expiresAt` column. Reads ignore expired rows, and a
  bounded batch of expired rows is deleted opportunistically after one request in twenty that the
  limiter lets through, never one answered 429 (`waitUntil`, see `rate-limit-cleanup.ts`; `rateLimit`
  takes a `sample` function so a test is deterministic); the `jobs` flag adds a scheduled sweep for
  the rest. The expiry column is indexed (`rate_limit_expires_at_idx`) so the delete does not read
  the whole table: index the expiry column of any table you sweep.
- **The test database.** Tests run on a D1 with the migrations applied. Storage is isolated per
  test file; `tests/api/setup.ts` empties every table before each test, so a new table needs nothing
  there. The e2e state is `.e2e-state`, rebuilt by `bun run e2e:db`; the development state is
  `.wrangler/state`.
- **Never.** A module-level client (`infra/db.ts` builds one per request from the binding); reading
  `process.env`; a `--remote` flag in any script or test. Remote databases are created and migrated
  by a person with `wrangler d1` (see Deployment); no script of the template does it.

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
  `internal` envelope: no message, stack or query text reaches the client. A D1 failure the
  controller can name (a unique violation) is caught there and thrown as `conflict`.
- Every API response carries `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
  and `Cross-Origin-Resource-Policy: same-origin` (the root middleware): it is data, never a
  document.
- Logging is `ctx.log` (one JSON line per call). Never put a header, a body, a secret or a query
  parameter in a field. A failed Drizzle query is logged with its query text (placeholders) and the
  database's own message, never its parameters (`logger.ts`).
- Health: `GET /api/health` (no store) and `GET /api/health/ready` (pings D1, 503 with the map).
- Every endpoint's test covers its validation failure and its not-found path, asserting the
  envelope's `code` and `requestId`, not only the status.

## Tests

`bun run test` runs two vitest projects. `unit` runs in Node (`tests/unit/`): pure code, the import
boundaries, `wrangler.jsonc`, the contract, the `assemble` step on fixture output and `start` on a
fixture build (it starts `wrangler pages dev` on a port the OS chooses, with its own output and state
folders in a temp directory, so `check` never swaps this package's `dist/` under a running `dev` or
`start`, and ends it). `api` runs in workerd
(`tests/api/`, `bun run test:db`): a global setup builds the functions once
(`wrangler pages functions build`), and every test sends a request to that built worker, through
the real routing and the root middleware, against a D1 with the migrations applied. Bindings for the
run (`ENVIRONMENT: test`) are in `vitest.config.ts`.

- `tests/api/helpers.ts`: `send(path, { method, body, headers })` returns the `Response`;
  `json(response)` reads it; `through(handler, path, { bindings, params })` runs one handler built in
  the test under the root middleware, for what no route exercises (a probe that throws, a
  production environment, a broken database, a fake binding); `settle` awaits what a handler gave
  to `waitUntil`.
- Storage is isolated per test file, not per test: `tests/api/setup.ts` empties every table before
  each test. A new table needs nothing there.
- **Long paths on Windows** (observed, not a documented platform rule): wrangler's local D1 file is
  `.e2e-state\v3\d1\miniflare-D1DatabaseObject\<64 hex>.sqlite` (and under `.wrangler\state\` for
  `dev` and `migrate`). Under a package path of about 140 characters it passed the 260-character
  limit and `bun run e2e:db` or `bun run migrate` failed with only `internal error; reference = ...`.
  The fix is a shorter project path.
- A test never starts a listener of its own (`start.test.ts` starts the real script) and never calls
  a remote binding. A test of a new binding fakes it (see Migrating Pages Functions, step 5).
- `RATE_LIMIT_SCALE` (1 to 1000, default 1) multiplies every limit in `RATE_LIMITS`; an e2e run
  raises it. There is no switch that turns limiting off.
- `tests/unit/openapi.test.ts` fails on a stale `openapi.json`: run `bun run openapi`.
- Tests first: write the failing test, see it red, then the code; each behaviour has a happy path
  and a failure or empty one. No `.skip`, `.only`, `.todo`, `.skipIf` or test-name filter in a gate
  command; a removed test is named and justified in the stage report. `bun run check` never needs
  Docker or an account.

## Deployment

Nothing here is done by an agent. The hooks of a harness project refuse `wrangler deploy`,
`login`, `secret`, `delete` and any command with `--remote` for an agent: report what is needed and
stop, never retry another way. A person does the following. The template was proven locally only
(no session holds an account): the first deployment is its proof, so check each step below on it.

1. **The Pages project.** Create it Git-connected to the repository's production branch (`main`).
   Set `name` in `wrangler.jsonc` to the project's name. Settings:

<!-- @frontend-start -->
   | Setting | With the frontend of this project |
   | --- | --- |
   | Root directory | the path of this package from the repository root (`__PACKAGE_DIR__`) |
   | Build command | `(cd __FRONTEND_PATH__ && bun install --frozen-lockfile && bun run build) && bun install --frozen-lockfile && bun run assemble` |
   | Build output directory | `dist` |
   | Environment variables | `NODE_VERSION=24`, `BUN_VERSION` of 1.4 or later (production and preview) |
<!-- @frontend-end -->
<!-- @nofrontend-start -->
   | Setting | Without a frontend |
   | --- | --- |
   | Root directory | the path of this package from the repository root (`__PACKAGE_DIR__`) |
   | Build command | `bun install --frozen-lockfile && bun run assemble` |
   | Build output directory | `dist` |
   | Environment variables | `NODE_VERSION=24`, `BUN_VERSION` of 1.4 or later (production and preview) |
<!-- @nofrontend-end -->

   Pages installs dependencies in the root directory by itself; the build command installs the
   frontend's, which has its own lockfile. The build image's default Node is older than this
   package's `engines`, hence `NODE_VERSION` (platform documentation; confirm on the first build).
   Pages compiles `functions/` and reads `wrangler.jsonc`; once the file exists it, not the
   dashboard, owns bindings and plain variables (secrets stay in the dashboard). Every key that is
   not inherited (`vars`, `d1_databases`, `ai`, `services`, ...) must be restated in `env.preview`
   and `env.production` as soon as one of them is.
2. **The databases.** `wrangler d1 create <project>-preview` and `<project>-production`; put each
   printed id into its environment of `wrangler.jsonc` (the development id stays fake: that database
   is local only). `preview` has its own database so a preview build never runs against production
   data. Pages applies the top-level values to production only when `env.production` does not
   override them, and this file overrides them.
3. **Secrets, per environment** (production and preview are separate lists, in the dashboard under
   Settings, Variables and Secrets): none until a feature needs one. `ENCRYPTION_KEY` (base64 of 32 random bytes,
   `openssl rand -base64 32`, different in each environment) is optional and has no default: set it
   when the first feature calls `encrypt`, which reads it through `requireEncryptionKey(ctx.env)`
   (it throws the configuration error "ENCRYPTION_KEY is not set" when it is missing); a value that is
   set must be valid in every environment. `ENVIRONMENT` comes from `wrangler.jsonc`. `RATE_LIMIT_SCALE` and `LOG_LEVEL` are optional
   plain variables.
4. **Migrations.** A remote database is migrated by hand, after an export:
   `wrangler d1 export <database> --remote --output backup.sql`, then
   `wrangler d1 migrations apply <project>-preview --remote`, naming the database (the top-level
   `DB` entry is the fake development one; whether your wrangler also takes `--env preview` is not
   proven here: read what it prints before confirming). Apply to `preview` first, then
   `<project>-production`. Nothing in the template does it for a deploy.
5. **Check the first deployment.** A page carries its policy meta and the fixed
   `Content-Security-Policy` header and the static headers (`curl -I` on a page); `/api/health` answers 200 with an `x-request-id`; a static
   page has none; an unknown page answers the 404 page with status 404; `/about` and `/about/` answer
   as intended (see the frontend's guide).
6. **Platform limits that matter** (developers.cloudflare.com, checked 2026-11-17): a `_headers` file
   holds 100 rules of 2,000 characters; `_redirects` holds 2,000 static and 100 dynamic rules; a site
   holds 20,000 files of 25 MiB at most on the free plan; 500 builds a month and a 20 minute build on
   the free plan; Functions are billed and limited as Workers (10 ms CPU a request on the free plan,
   128 MB of memory); D1 limits are in Adding the data layer. A password hash needs the paid plan's
   CPU (nothing here hashes).
<!-- @jobs-start -->
7. **The jobs Worker** (flag `jobs`): a second deployment from the same repository,
   `wrangler deploy --config workers/jobs/wrangler.jsonc`, after the databases of step 2 exist and
   the ids in that file match the Pages project's. Its cron fires hourly. See Jobs.
<!-- @jobs-end -->

**Local secrets.** `wrangler pages dev` reads a file named `.env` in this directory (copy
`.env.example`; it is git-ignored). Never create a `.dev.vars` beside it: where that file exists,
`.env` is ignored whole. `.env.<environment>` files are not read (Pages refuses `--env` locally), and
a value in `.env` overrides the same key in `wrangler.jsonc`. Every key of `.env` becomes a binding,
so keep it to this package's configuration.

## Migrating Pages Functions

For an existing Pages site: JavaScript Functions with their logic in a `functions/api/_lib/`
folder, a D1 database that was migrated by hand and holds data, Git-connected builds from `main`
whose previews share the live data. Each step is one task, in this order, and each leaves `bun run
check` green and the site deployable. A person does what Deployment says is a person's; an agent
prepares the files.

1. **A preview environment on its own database first.** Before any code moves, give `env.preview`
   its own D1 database (Deployment, step 2), seeded from an export of production
   (`wrangler d1 export <production> --remote --output backup.sql`, then
   `wrangler d1 execute <preview> --remote --file backup.sql`, a person's commands), so that a preview
   build stops reading and writing live data. Restate `vars` and every binding in both environments.
2. **Baseline the existing database's migrations without running them.** The migrations folder must
   describe what the database already has, and the database must be told so.
   - Make `server/api/<module>/model.ts` match each live table (compare with
     `wrangler d1 execute DB --remote --command "SELECT name, sql FROM sqlite_master"`), delete the
     reference module and the template's `migrations/0000_init.sql` with `migrations/meta/` (no real
     database has applied them), keep `rateLimitTable` out of this one generate (comment its export in
     `server/infra/tables.ts`), run `bun run db:generate -- --name baseline`, restore the table and run
     `bun run db:generate -- --name rate_limit`: `0000_baseline.sql` is the existing schema and
     `0001_rate_limit.sql` is new.
   - Register `0000_baseline.sql` as applied, locally first (load the export into the local database
     with `wrangler d1 execute DB --local --file backup.sql`):

     ```
     wrangler d1 execute DB --local --command "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL); INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0000_baseline.sql');"
     wrangler d1 migrations apply DB --local
     wrangler d1 migrations list DB --local
     ```

     Only `0001_rate_limit.sql` is applied; `list` then prints "No migrations to apply!" and the rows
     are untouched. The name in `d1_migrations` is the file name with `.sql`.
   - Remote: a person runs the same three commands with `--remote` instead of `--local`, naming the
     preview database and then the production one (as in Deployment, step 4), after the export. Run the registration once, only against a database that really
     has the baseline's tables: on a fresh database it would mark the tables created and never create
     them.
3. **Move the logic into `server/`, one endpoint at a time.** `tsconfig.json` has `allowJs: true`
   and `checkJs: false`, and the lint reads `.js`, so JavaScript can live in `server/` first and
   TypeScript arrives file by file (`// @ts-check` on a file opts it in). For each endpoint, as one
   task:
   1. A test in `tests/api/<name>.test.ts` through `send()` that pins the current behaviour; it
      passes against the old function.
   2. The logic moves from `_lib` into the layers (`schema.ts`, `controller.ts`, `service.ts`,
      `model.ts`, a gate in `middleware/`); `context.env.X` becomes `ctx.env` through `config/env.ts`.
   3. The route file becomes thin: `export const onRequestPost = handle(validate(...), controller)`;
      delete the old `functions/api/<name>.js` in the same task (two files must not claim one path).
   4. The endpoint is registered in `schema.ts` and `bun run openapi` is run.
   5. The envelope replaces any ad-hoc error body: change the callers (the site's own scripts) in the
      same task, or the test records the difference.
   When no `_lib` file is left, delete the folder.
4. **Function routes outside `/api`** (two that answer HTML, say): the file stays at its path
   (`functions/share/[id].ts`), becomes `handle(...)` with a controller returning an HTML `Response`,
   and its path is added to `pages/_routes.json` (`"include": ["/api/*", "/share/*"]`; at most 100
   rules). The root middleware wraps it: an error leaves as the JSON envelope, so the controller
   renders its own failure page, sets `content-type`, its own `cache-control` and its own
   `Content-Security-Policy` (a `_headers` file never covers a Function). The contract documents
   `/api` only; test it through `send()`.
5. **Other bindings.** Declare each in `wrangler.jsonc` (Workers AI `ai: { binding: "AI" }`, a
   service binding `services: [{ binding, service }]`) at the top level and in `env.preview` and
   `env.production`; run `bun run types`; add an accessor in `server/infra/bindings.ts` that throws
   a clear message when the binding is missing (as `d1()` does) and keep plain values in
   `config/env.ts`. In tests, fake it: pass `{ ...env, AI: fake }` as `bindings` to `through()`, or
   set `miniflare.serviceBindings` in `vitest.config.ts`. `ASSETS` (the site's static files) exists
   on Pages itself: add `ASSETS: Fetcher` to the `Bindings` type and give tests
   `buildPagesASSETSBinding(<dir>)` from `@cloudflare/vitest-plugin`. Workers AI has no local engine:
   a test always fakes it. The jobs Worker restates the bindings it uses in its own `wrangler.jsonc`.
6. **An admin area behind Cloudflare Access.** The template ships no gate (a product decision). Two
   shapes: a gate in the chain of each admin endpoint (`server/middleware/access.ts`), or, for a
   whole path including its static pages, a `functions/admin/_middleware.ts` that runs the gate and
   calls `next()`, with `/admin/*` added to `pages/_routes.json`. The gate verifies the
   `Cf-Access-Jwt-Assertion` header's signature against the team's keys
   (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`), its audience (the Access
   application's AUD tag) and its expiry, and refuses with an `unauthenticated` or `forbidden`
   `AppError`; the team domain and the AUD tag are plain variables in `config/env.ts`. Cover the
   preview domain with the Access application too. Verifying a JWT needs a library (`jose`) or
   WebCrypto: a dependency is a plan decision. Test it with a locally signed token and the public key
   passed through the bindings.
7. **What not to migrate.** The request id, error envelope, security headers, request log, rate
   limiter and CORS helpers a `_lib` folder grew: the root middleware and `middleware/` have them.
   Hand-written CORS (one origin needs none). Dashboard-set variables and bindings that
   `wrangler.jsonc` now owns. A second database client or an ORM beside Drizzle. A `wrangler.toml`
   (this package has `wrangler.jsonc`). The legacy site's pages and redirects: they move with the
   frontend's guide (`Migrating a site into Astro`).
<!-- @jobs-start -->

## Jobs

The `jobs` flag adds `workers/jobs/`: a second Worker with its own `wrangler.jsonc` (its name is
`<project>-jobs`, the same D1 binding and database names per environment as the Pages project, one
cron trigger, no secret) and `index.ts`, one `scheduled` handler that runs the one job: deleting
expired rate-limit rows in bounded batches (`server/middleware/rate-limit-cleanup.ts`, the code the
request path also calls; the bound is `RATE_LIMIT_PURGE_MAX_BATCHES`). `tests/unit/jobs-config.test.ts`
asserts the two wrangler files agree and `tests/api/jobs.test.ts` calls the handler in workerd.
`workers/` may import what `functions/` may; nothing imports it. A second job is one more call in
`scheduled`, its logic an exported rule of a controller, its own test.

Run it locally, on the database `bun run migrate` prepared (without `--persist-to` the Worker
keeps its own empty state under `workers/jobs/` and the query fails):
`wrangler dev --config workers/jobs/wrangler.jsonc --test-scheduled --persist-to .wrangler/state`,
then request `/cdn-cgi/handler/scheduled` on its port (8787 unless `--port` is given). There is no
deploy script: a person deploys the Worker with `wrangler deploy --config workers/jobs/wrangler.jsonc`.

<!-- @jobs-end -->
