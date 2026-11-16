# App

The layer map of the one package: static Astro pages, Pages Functions and the schemas they
share, shipped to Cloudflare Pages with a D1 database. What holds for the whole repository
(versions, commands, definition of done) is in the repository's root `AGENTS.md`; nothing here
repeats it. This file ships with the package and an agent working in it loads it.

## Layer map

| Path                                                                                                       | What it is                                                                                                                                   | Lane     |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `src/`                                                                                                     | Astro pages, layouts, components, styles; static output, no adapter                                                                          | frontend |
| `public/`                                                                                                  | `_routes.json`, `_headers`, `_redirects`, `theme-init.js`, static files                                                                      | frontend |
| `functions/`                                                                                               | File path = route. `_middleware.ts` wraps every function; a route file is its gate chain and the call to a controller, nothing else          | backend  |
| `server/api/<module>/`                                                                                     | `controller.ts` (the module's public API and its HTTP handlers), `service.ts` (its queries), `model.ts` (its Drizzle table)                  | backend  |
| `server/middleware/`                                                                                       | `handler.ts` (`handle`, `Context`, `Gate`, `rootMiddleware`), `validate`, `rate-limit`, `error-handler`, `request-id`, `request-log`, `body` | backend  |
| `server/config/`                                                                                           | `env.ts` (the bindings as validated configuration), `constants.ts` (policy)                                                                  | backend  |
| `server/models/<name>/`                                                                                    | `interface.ts`, `type.ts`, `enum.ts`, `constants.ts` of one entity                                                                           | backend  |
| `server/services/`                                                                                         | `logger.ts`, `security/crypto.ts`, `utils/` (pure: time, pagination, error, encoding, client address)                                        | backend  |
| `server/infra/`                                                                                            | `bindings.ts` (the typed bindings), `db.ts` (Drizzle over `DB`), `tables.ts` (the rate-limit table)                                          | backend  |
| `shared/`                                                                                                  | `schemas/<module>.ts` (zod: what the route validates and the page types its call with), `types/api.ts` (the envelope, error codes, `Page`)   | backend  |
| `migrations/`                                                                                              | SQL from `drizzle-kit generate`, applied by `bun run migrate`                                                                                | backend  |
| `scripts/`                                                                                                 | `dev.mjs`, `start.mjs`, `e2e-db.mjs`                                                                                                         | both     |
| `tests/`                                                                                                   | `api/` (workerd, through the real routing), `unit/` (Node: pure code, the lint boundaries, the config files)                                 | qa       |
| `wrangler.jsonc`, `worker-configuration.d.ts`, `drizzle.config.ts`, `tsconfig.server.json`, `.env.example` | platform and tool configuration                                                                                                              | backend  |

`server/` uses only the web platform's `Request` and `Response` and the bindings type: it
imports no Pages type, so a move to Workers replaces `functions/` and `public/_routes.json` only.
Environment values come from the request's bindings, validated once per isolate in
`server/config/env.ts`; nothing reads `process.env` (lint) and nothing keeps a connection at
module level.

## Request flow

`functions/_middleware.ts` runs `rootMiddleware` around every function: it gives the request an
id (honouring a well-formed `x-request-id`), turns a thrown error into the envelope, sets the
response headers (`x-request-id`, `x-content-type-options: nosniff`, `referrer-policy`,
`cache-control: no-store` unless the handler set one) and writes one JSON log line (method, path
without the query, status, duration, request id). A static page never reaches it:
`public/_routes.json` includes `/api/*` only.

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
  returns nothing to continue. A gate fills a slot it owns: `validate` sets `ctx.input`.
  A gate that identifies the caller adds one `caller` field to `Context` and sets it (the `auth`
  flag does).
- **A controller** is `(ctx) => Response | Promise<Response>`. It reads the validated input with
  `readInput(ctx, <operation>Request)`, throws an `AppError` for a refusal, and answers with
  `json(body, status)` or `noContent()`.
- Order: rate limit, then `validate`, then the controller. A 429 does not wait for parsing and a
  controller never sees unparsed input.

## Import direction

Enforced by `eslint.config.mjs` (zones plus specifier bans, so an alias cannot dodge them) and
proved by `tests/unit/boundaries.test.ts`; each message names the layer to use instead.

- `src/` imports `shared/` only. `server/` and `functions/` never import `src/`. `shared/` imports
  none of the three.
- `functions/` imports controllers, `server/middleware/`, `server/config/` and `shared/`.
- Inside `server/`: `models/` and `shared/` are leaves; `config/` imports nothing of `server/`;
  `services/utils/` is pure; `services/` never imports `middleware/` or `api/`; `infra/` imports
  `config/` and `models/` only; `middleware/` never imports `api/`.
- A module's `service.ts` and `model.ts` are imported only inside that module, and the data layer
  never imports `middleware/` (it never sees HTTP). Another module is reached through its
  `controller.ts` only, from a `controller.ts`.
- The one path alias is `@shared/*` (both tsconfigs, the vitest config). `functions/` and
  `server/` import each other by relative path, because the platform's function bundler resolves
  aliases from the root `tsconfig.json` only.
- Not enforced (review): a route file holds nothing but gates and one controller call; a rule
  another module needs is an exported typed function of the controller, never a handler.

## Commands

`bun run check` is every gate and needs no Docker or account: `wrangler types --check`,
`astro check`, `tsc` on the server and test projects, `eslint`, `prettier --check`, then every
test. `bun run test:db` runs the API project alone. `bun run migrate` applies the migrations to the
local database (`.wrangler/state`). `bun run e2e:db` rebuilds a separate state folder
(`.e2e-state`) and `bun run start` serves the build on it; `bun run dev` never reads it.
`bun run dev` serves the pages with Astro on 4321 and proxies `/api` to `wrangler pages dev`
on 8788; `bun run start` serves everything on 8788 (it builds first when `dist/` is missing).
After a `wrangler.jsonc` change run `bun run types`: the generated types embed its values.

## Adding a module

Work in this order, test first.

1. `shared/schemas/<name>.ts`: the zod schemas, the value sets and limits, one
   `<operation>Request` object per endpoint (only the parts it reads), and the inferred types.
2. `server/models/<name>/`: `interface.ts` (the stored record), `type.ts`, `enum.ts` and
   `constants.ts` re-export what `shared/` defines, so nothing is declared twice.
3. `tests/api/<name>.test.ts`, red (see Tests).
4. `server/api/<name>/model.ts` (the table), then `bun run db:generate -- --name <name>` and
   `bun run migrate` (see Adding the data layer).
5. `service.ts`: queries taking `db` as their first parameter.
6. `controller.ts`: one handler per endpoint, then the rules other modules need.
7. `functions/api/<name>/index.ts` and `[id].ts`: the gate chain and the controller call, plus
   `onRequest = methodNotAllowed(...)`. Add the table of a new module to
   `drizzle.config.ts` only if it is outside `server/api/*/model.ts`.
8. `bun run check`.

Start by copying `server/api/module/`, `server/models/module/`, `shared/schemas/module.ts`,
`functions/api/module/` and `tests/api/module.test.ts`, renaming `module` to `<name>`, `Module`
to `<Name>`. Drop the reference module (those paths and its migration's table) once a real one
exists.

- One request object, two readers: `validate(<operation>Request)` in the route file and
  `readInput(ctx, <operation>Request)` in the handler.
- Every endpoint is public until the `auth` flag adds the gates; a route that needs a caller
  refuses without one.
- A list paginates: `PageQuery` and `pageOf` from `shared/schemas/page.ts`, the service fetches
  `limit + 1` rows and `toPage` slices, the cursor is opaque. Paths are singular
  (`/api/post`, `/api/post/{id}`), bodies JSON only. Statuses: 200 read and update, 201 create
  (the created resource), 204 delete (no body), 400 validation, 404 missing, 405 wrong method,
  409 conflict, 429 rate limited.
- Ids are made in the controller (`crypto.randomUUID()`).

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
  template does it. `wrangler.jsonc` names a separate database per Pages environment, with fake
  ids to replace.

## Adding a feature

A page is `src/pages/<name>.astro` on `src/layouts/base-layout.astro`; Astro builds static output
with `build.format: 'file'` (so `/page` answers 200, not a 308). Page behaviour is a `<script>` in
the page and calls the API through `shared/` schemas; the page sections of this guide are
completed with the page template.

## Styling

Brand tokens come from the generator into `src/styles/themes/brand.css`; the no-flash theme
script is the file `public/theme-init.js`. The design system is completed with the page template.

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
  (`shared/types/api.ts`, `server/services/utils/error.ts`): `validation_failed` 400,
  `unauthenticated` 401, `forbidden` 403, `not_found` 404, `method_not_allowed` 405 (with `Allow`),
  `conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415, `rate_limited` 429 (with
  `Retry-After`), `internal` 500, `upstream_unavailable` 503.
- A ZodError that escapes is a 400. Anything else is logged with its stack and leaves as a bare
  `internal` envelope: no message, stack or query text reaches the client.
- Only a 401 for a request with no valid access token carries `WWW-Authenticate: Bearer`
  (`authenticationRequired()`); every other 401 carries none.
- Logging is `ctx.log` (one JSON line per call; a field whose key looks secret prints
  `[redacted]`). Never put a header, a body or a secret in a field.
- Health: `GET /api/health` (no store) and `GET /api/health/ready` (pings D1, 503 with the map).

## Tests

`bun run test` runs two vitest projects. `unit` runs in Node (`tests/unit/`): pure code, the
import boundaries, `wrangler.jsonc`. `api` runs in workerd (`tests/api/`, `bun run test:db`):
a global setup builds the functions once (`wrangler pages functions build`), and every test sends
a request to that built worker, through the real routing and the root middleware, against a D1
with the migrations applied. Bindings for the run (`ENVIRONMENT: test`) are in
`vitest.config.ts`.

- `tests/api/helpers.ts`: `send(path, { method, body, headers })` returns the `Response`;
  `json(response)` reads it; `through(handler, path, { bindings, params })` runs one handler built in
  the test under the root middleware, for what no route exercises (a probe that throws, a
  production environment, a broken database).
- Storage is isolated per test file, not per test: `tests/api/setup.ts` empties every table
  before each test. A new table needs nothing there.
- A test never starts a listener and never calls a remote binding. Tests first: write the
  failing test, see it red, then the code; each behaviour has a happy path and a failure or
  empty one. Never delete, skip or focus a test.

## Deployment

The target is Cloudflare Pages: `astro build` writes `dist/`, Pages serves it and the functions
on one origin. `wrangler.jsonc` carries `ENVIRONMENT` and a D1 binding for development, `preview`
and `production` (Pages environments do not inherit bindings, and the preview database differs
from production's). No secret is in the file or in the template; production secrets are set by a
person, in the dashboard or with `wrangler secret`. Local overrides go in a `.env` file (see
`.env.example`); never create a `.dev.vars` beside it: where that file exists, `.env` is ignored
whole. No script of the template deploys, logs in or reaches a remote binding, and an agent never
runs `wrangler deploy`, `login`, `secret` or any command with `--remote`.
