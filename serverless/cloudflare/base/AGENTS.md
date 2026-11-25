# Serverless API

The layer map of the Worker package: an API that runs as one Cloudflare Worker with static assets,
routed by Hono, with D1 through Drizzle and an OpenAPI contract. What holds for the whole repository
is in the repository's root `AGENTS.md`; nothing here repeats it.

## Packages and conventions

- Shipped beyond the platform: `hono` (routing), `zod` (validation and the contract's source),
  `@asteasolutions/zod-to-openapi` (OpenAPI 3.1 from the schemas), `drizzle-orm` and `drizzle-kit`
  (D1 queries and SQL migrations). Dev: `wrangler`, `vitest` with `@cloudflare/vitest-plugin`,
  ESLint 10 with `import-x`, Prettier. Nothing else is added without a plan.
- TypeScript is pinned to `~6.0.3`: `typescript-eslint` peers below 6.1, and a frontend beside this
  package runs `astro check`, which refuses 7. Move it only with both.
- No accounts: every endpoint is public except `/api/admin`, whose one gate refuses everything until
  the product writes its own (the Cloudflare Access recipe is in Migrating Pages Functions, step 6).
  A product's other gates go in the gate chain of the route that needs them.
- Logging goes through `server/services/logger.ts` (one JSON line per call, a secret-looking key
  prints `[redacted]`); nothing else calls `console`.
- Files are kebab-case, entities are singular (`/api/post`, `server/api/post/`, table `post`),
  database columns are snake_case and code fields camelCase. The domain's own term names an entity.
- Not a Node server: no `fs`, no listener, no module-level connection. `nodejs_compat` gives
  `node:crypto` and `node:buffer`; use the web platform first.

## Layer map

| Path                    | What it is                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/index.ts`       | The Worker's default export (`main`): `fetch` hands the request to the app; with the `jobs` flag `scheduled` runs the cron's job                                    |
| `server/server.ts`      | The app, only mounting: the root middleware, each entity's router at `/api/<name>`, the admin namespace, the `not_found` envelope for other `/api` paths, everything else handed to `frontendPages` |
| `server/api/<entity>/`  | `routes.ts` (gates, validation, controller call per endpoint), `schema.ts` (zod, the contract's leaf, its OpenAPI registration), `controller.ts` (rules and handlers), `service.ts` (queries), `model.ts` (its Drizzle table); `api/admin/routes.ts` is the admin namespace's router, `api/admin/<name>/` its entities |
| `server/middleware/`    | `handler.ts` (`handle`, `guard`, `Context`, `Gate`, `rootApp`, the root middleware), `admin-gate`, `frontend-host` (pages and the admin host rule), `validate`, `rate-limit` and `rate-limit-cleanup`, `error-handler`, `request-id`, `request-log`, `body` |
| `server/config/`        | `env.ts` (the bindings as validated configuration), `constants.ts` (policy)                                                                                                                      |
| `server/models/<name>/` | `interface.ts`, `type.ts`, `enum.ts`, `constants.ts` of one entity                                                                                                                               |
| `server/services/`      | `logger.ts`, `security/crypto.ts`, `utils/` (pure helpers)                                                                       |
| `server/infra/`         | `bindings.ts` (the typed bindings), `db.ts` (Drizzle over `DB`), `tables.ts` (the rate-limit table)                                                                                              |
| `server/openapi.ts`     | Builds the OpenAPI document from every entity's `schema.ts`; only `scripts/openapi.ts` and the tests import it                                                                                   |
| `static/`               | What the platform reads beside the built site: the base `_headers` and `_redirects`                                                                                                              |
| `migrations/`           | SQL from `drizzle-kit generate`, applied by `bun run migrate`; `meta/` is drizzle's own                                                                                                          |
| `scripts/`              | `openapi.ts`, `assemble.mjs`, `dev.mjs`, `start.mjs`, `e2e-db.mjs`; `lib/` holds their logic                                                                                                     |
| `tests/`                | `api/` (workerd, the Worker's own entry), `unit/` (Node: pure code, the lint boundaries, the config files, the contract, `assemble`, `start`), `support/`                                         |
| `openapi.json`          | The committed contract; a frontend generates its client from it                                                                                                                                  |
| `wrangler.jsonc`, `worker-configuration.d.ts`, `types-vars.txt`, `drizzle.config.ts`, `tsconfig.json`, `.env.example` | Platform and tool configuration. `worker-configuration.d.ts` is generated and committed; `types-vars.txt` is empty on purpose                                  |

Environment values come from the request's bindings, validated once per isolate in
`server/config/env.ts`; nothing reads `process.env` (lint) and nothing keeps a connection at
module level.

## Where does X go

| You are adding…                 | It goes in                                                                | Shape                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| An endpoint                     | `server/api/<name>/routes.ts` + `controller.ts`                           | one `routes.<method>(path, handle(...gates, controller))` line; its `<operation>Request` in `schema.ts`          |
| A resource with endpoints       | `server/api/<name>/`, `server/models/<name>/`, a line in `server/server.ts` | copy the reference `entity`; one line in `server/openapi.ts`; see Adding an entity                              |
| A request or response shape     | `server/api/<name>/schema.ts`                                             | zod, `satisfies` the `models/` type, with its `registerPath`                                                   |
| A table                         | `server/api/<name>/model.ts`                                              | then `bun run db:generate -- --name <name>` and `bun run migrate`; a table no entity owns is `server/infra/tables.ts` |
| A query                         | `server/api/<name>/service.ts`                                            | takes `db` first; private to the entity                                                                        |
| A business rule                 | `server/api/<name>/controller.ts`                                         | in the handler; an exported async function of plain data once another entity needs it                          |
| A gate (authorisation, a limit) | `server/middleware/<name>.ts`, chained in the routes.ts                   | `(ctx) => void \| Response`; throws an `AppError` to refuse; never imports `api/`                               |
| A policy constant               | `server/config/constants.ts`                                              | durations, limits, batch sizes; an entity's field limits are `server/models/<name>/constants.ts`               |
| An environment variable         | `server/config/env.ts` + `.env.example`                                   | in the zod schema; a secret is optional until a feature needs it, has no default, and is invalid when set wrongly |
| A platform binding              | `wrangler.jsonc` in every environment, then `bun run types`               | an accessor in `server/infra/bindings.ts`; see Migrating Pages Functions, step 5                               |
| A secret                        | the Worker's secrets per environment (a person), `config/env.ts`, `.env.example` | locally a line of `.env` (see Deployment)                                                                |
| A redirect or a static header   | the frontend's `public/_redirects`, `public/_headers`; `static/` with no frontend | the files merge in `assemble`; never set or detach the Content-Security-Policy                          |
| An admin endpoint               | `server/api/admin/<name>/`, one line in `server/api/admin/routes.ts`      | an entity like any other, at `/api/admin/<name>`; the namespace's gate runs first                                 |
| An SDK endpoint                 | `server/api/sdk/<name>/`, one line in `server/api/sdk/routes.ts`          | an entity like any other, at `/api/sdk/v1/<name>`; the gate runs first; `v1` only adds                            | <!-- @sdk -->
| A route outside `/api`          | a router like an entity's, mounted in `server/server.ts`                   | beside one frontend its path also goes in `assets.run_worker_first`; it sets its own headers; see Migrating Pages Functions, step 4 |
| A pure helper                   | `server/services/utils/<name>.ts`                                         | no I/O, no state                                                                                               |
| A shared capability with state  | `server/services/<name>.ts`                                               | logging, security primitives; stateful means per request, never module level                                   |
| A scheduled job                 | a call in `scheduled` of `server/index.ts`, its logic an exported rule    | with the `jobs` flag only; see Jobs                                                                            | <!-- @jobs -->

## Request flow

`rootApp()` (`middleware/handler.ts`) runs the root middleware on `/api/*`: it gives the request an
id (honouring a well-formed `x-request-id`), turns a thrown error into the envelope, sets the
response headers (`x-request-id`, `nosniff`, `referrer-policy: no-referrer`, the API policy,
`cache-control: no-store` unless the handler set one) and writes one JSON log line.
<!-- @nofrontends-start -->
A page never reaches it: `run_worker_first` is `["/api/*"]`, the platform answers every other path
from the assets, and a `_headers` file never covers a Worker response.
<!-- @nofrontends-end -->
<!-- @frontends-start -->
A page never gets it, but every request runs the Worker (`run_worker_first` is `true`): a path
outside `/api` goes to `frontendPages`, which maps the host to a frontend (`FRONTEND_HOSTS`,
validated in `config/env.ts`), fetches the page from that frontend's folder through `env.ASSETS`
and removes the folder from a redirect's `Location`; a host the map lacks, or a page path holding
an encoded slash, backslash or dot (`%2f`, `%5c`, `%2e`), gets a 404 envelope.
`/api/*` answers on every host except `/api/admin`: see below.
<!-- @frontends-end -->

The flow: `index.ts → server.ts → root middleware → routes.ts → gates → validate → controller →
service → Drizzle → D1`. A routes.ts registers `routes.<method>(path, handle(...gates,
controller))` and, per path, `routes.all(path, methodNotAllowed(...methods))`; an unknown `/api/*`
path falls to the `not_found` envelope in `server.ts`. `/api/admin` has one gate for the whole
namespace, `guard(adminGate)` (`middleware/admin-gate.ts`): 403 for every request until the product
writes its own.
<!-- @frontends-start -->
Beside a frontend named `admin` the host rule runs first: on any other host the answer is the
`not_found` envelope, so nothing about the gate shows.
<!-- @frontends-end -->

```ts
// server/api/entity/routes.ts
routes.get('/', handle(validate(listEntityRequest), listEntity))
routes.post(
  '/',
  handle(
    rateLimit({ name: 'createEntityPerIp', ...RATE_LIMITS.createEntityPerIp, key: byIp }),
    validate(createEntityRequest),
    createEntity,
  ),
)
routes.all('/', methodNotAllowed('GET', 'POST'))
```

- **`Context`**, one object per request, passed to every gate and the controller: `request`, `url`,
  `env` (the validated configuration), `bindings` (the raw platform bindings), `db` (Drizzle over
  `DB`), `params`, `input`, `requestId`, `log` (bound to the request id) and `waitUntil`.
- **A gate** is `(ctx) => void | Response | Promise<...>`. It throws an `AppError` to refuse,
  returns a `Response` to answer in place of the controller, or returns nothing to continue. A gate
  fills a slot it owns: `validate` sets `ctx.input`.
- **A controller** is `(ctx) => Response | Promise<Response>`. It reads the validated input with
  `readInput(ctx, <operation>Request)`, throws an `AppError` for a refusal, and answers with
  `json(body, status)` or `noContent()`.
- Order: rate limit, then `validate`, then the controller. Every mutation carries its own
  `rateLimit` gate.

## Import direction

Enforced by `eslint.config.mjs` (deny zones, so a new file is constrained by default) and proved
by `tests/unit/boundaries.test.ts`; each message names the layer to use instead.

| Layer (the importer)                 | May import                                                                                     | Never                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `index.ts`, `server.ts`, `routes.ts` | controllers, schemas, `server/middleware/`, `server/config/`                                   | `services/`, `infra/`, `models/`, `openapi.ts`; nothing imports them |
| `server/models/`                     | `models/` only                                                                                 | every other layer                                        |
| `server/config/`                     | nothing of `server/`                                                                           | every other layer                                        |
| `server/services/utils/`             | `models/`, `config/`, `services/utils/`                                                        | `logger`, `security/`, `middleware/`, `infra/`, `api/`   |
| `server/services/`                   | `models/`, `config/`, `services/`                                                              | `middleware/`, `api/`                                    |
| `server/infra/`                      | `config/`, `models/`                                                                           | `middleware/`, `api/`, `services/`                       |
| `server/middleware/`                 | `config/`, `infra/`, `services/`, `models/`                                                    | `api/`                                                   |
| `api/<m>/schema.ts`                  | `models/`, `services/utils/`, `config/constants`                                               | everything else (it is the leaf)                         |
| `api/<m>/service.ts`, `model.ts`     | `models/`, `infra/`, `services/`, `config/`                                                    | `middleware/`, another entity                            |
| `api/<m>/controller.ts`              | its entity, `middleware/`, `services/`, `config/`, `models/`, another entity's `controller.ts` | another entity's `service.ts` or `model.ts`              |
| `server/openapi.ts`                  | every `schema.ts`, `services/utils/`                                                           | everything else; the request path never imports it       |

- An entity's `service.ts` and `model.ts` are imported only inside that entity. Another entity is
  reached through its `controller.ts` only, from a `controller.ts`, as `../<entity>/controller`.
- `hono` is imported by the entries, the `routes.ts` files and `middleware/handler.ts` only.
  `process.env` is refused in `server/`; read the validated `ctx.env`.
- **An entity that can move out.** These hold in every entity: it imports another only through its
  controller (lint); a rule it exports for another entity is async and takes and returns plain data
  (`db` aside, as first parameter), never a `Request`, a `Response`, `ctx` or a Hono type; entities
  share no state in memory (no module-level cache or singleton another entity reads); its router
  answers its endpoints mounted alone (`tests/api/routes.test.ts`). The last three are review items.
  A service binding can then stand in for the import (see Scaling out).

## Commands

`bun run check` is every gate and needs no Docker or account. After a `wrangler.jsonc` change run
`bun run types`: the generated types hold its variables as `string` (`--strict-vars=false`, so no
project's directory names are in them). The types commands name the empty `types-vars.txt` as their
only env file, so a local env file cannot change `Env`.

| Command               | Meaning                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `bun run check`       | Every gate (`typecheck`, `lint`, `format:check`, `test`)                                                                  |
| `bun run typecheck`   | `wrangler types --check`, then `tsc` on the package and on `tests/`                                                       |
| `bun run lint`, `format` | ESLint with the import zones; Prettier (`format:check` is the gate, `format` rewrites)                                 |
| `bun run test`        | Both vitest projects: `unit` (Node) and `api` (workerd)                                                                   |
| `bun run test:db`     | The `api` project alone (the `testDb` command)                                                                            |
| `bun run types`       | Regenerates `worker-configuration.d.ts` from `wrangler.jsonc`                                                             |
| `bun run migrate`     | Applies the migrations to the development database (`.wrangler/state`)                                                    |
| `bun run db:generate` | `drizzle-kit generate`: SQL from the models into `migrations/`                                                            |
| `bun run dev`         | `wrangler dev` on port __PORT__: the API alone, on an empty asset folder; a frontend's dev server proxies `/api` to it    |
| `bun run assemble`    | Builds `dist/` from the frontend's build output and `static/` (see Assets and assemble)                                   |
| `bun run e2e:db`      | Rebuilds `.e2e-state` from nothing and migrates it (the `e2eDb` command)                                                  |
| `bun run start`       | `assemble`, then `wrangler dev` once on `dist/` and `.e2e-state`, port __PORT__; `RATE_LIMIT_SCALE` and `LOG_LEVEL` come from the shell |
| `bun run openapi`     | Writes `openapi.json` (the `contract` command)                                                                            |

An e2e run is `bun run e2e:db` then `bun run start` with `RATE_LIMIT_SCALE=100`; it answers
`/api/health` within a few seconds (allow 8 s or more on a loaded machine) once the frontend's build
exists. `wrangler dev` watches the source: edit nothing during an e2e run. Never leave it running:
end the whole process tree (on Windows ending the `bun run` shell leaves wrangler and workerd alive;
the scripts end their own tree on SIGINT and SIGTERM). The development state (`.wrangler/state`)
and the e2e state (`.e2e-state`) never meet.

## Contract

`bun run openapi` writes `openapi.json` (OpenAPI 3.1, servers `/`) from the same zod schemas that
validate requests, in Bun and outside the runtime. Each entity registers its paths in a
`register<Name>` function at the bottom of its `schema.ts`; one line per entity in
`server/openapi.ts` lists it. Paths are singular, tags are the entity name, every failure is the
`ErrorBody` envelope (`errorResponses(400, 404, ...)`), and an operation has no hand-written id.
The file is committed;
`tests/unit/openapi.test.ts` fails when it is stale (run `bun run openapi`), when a documented
operation has no mounted route and when a path is documented outside `/api`. A frontend's
`contract` command reads it.

## Assets and assemble

The Worker serves the site and the API on one origin: `assets` names `dist/`, which
`scripts/assemble.mjs` builds; `static/` holds what the platform reads beside the site. `assemble`
never builds the frontend: a missing or empty output fails with "the frontend's output <path> is
missing or empty: build the frontend first".

<!-- @frontend-start -->
1. The frontend's built output directory (`__FRONTEND_PATH__/__FRONTEND_OUT__`, fixed when the
   package is generated beside a frontend) is copied into `dist/`.
   `--frontend <dir>` overrides it. <!-- @nofrontends -->
   It must hold `index.html` at its root and one policy `<meta>` per page (an Astro build with
   `security.csp`), and carry its own `_headers` and `_redirects` through its `public/`, with the
   `/_astro/*` immutable cache rule in its own `_headers`. `--out <dir>` builds somewhere other
   than `dist/`.
<!-- @frontend-end -->
<!-- @nofrontend-start -->
1. The frontend's built output directory (none was in the plan, so only `--frontend <dir>` names
   one; a frontend added later sets it in `scripts/assemble.mjs`) is copied into `dist/`.
<!-- @nofrontend-end -->
2. `static/`'s files are laid over it. `_headers` and `_redirects` are merged, the frontend's lines
   first; any other file replaces the frontend's.
3. Two policies apply to every page, and a browser enforces both. The page's own `<meta
   http-equiv="content-security-policy">` stays untouched: it carries that page's hashes. `assemble`
   adds one fixed line under the first `/*` rule of
   `dist/_headers` (creating the rule when there is none) with what a meta cannot carry:
   `frame-ancestors 'none'`, `base-uri`, `object-src 'none'`, `form-action`, `connect-src`,
   `img-src 'self' data:`, `font-src`, `media-src`, `frame-src`, `worker-src` and `manifest-src`. It
   has no hash and no `default-src`, `script-src` or `style-src`, so it never blocks what the meta
   allows and no page accepts another page's hashes.

<!-- @frontends-start -->
Beside several frontends each build goes to `dist/<dir>/`, and `assemble` fails naming the
frontend whose build is missing. `--only <dir>` assembles that one alone (a frontend's own e2e;
`start` passes it on), `--frontend <dir>=<output dir>` (repeatable; a value that is no pair or names
no frontend fails) moves a build. A build's `_headers` and
`_redirects` are merged into the root files with `/<dir>` in front of every path and path
destination (a rule that is no path is refused), never copied into the folder. `static/_headers`
stays as it is (`/*` covers every folder); the policy line goes under each folder's `/<dir>/*`
rule, after that folder's pages are checked as below. Any other file of `static/` is not served
(every page path is read from a frontend's folder) and an unprefixed rule there matches nothing
but `/*` headers: put such a file or rule in a frontend's own `public/`. This code exists only
while the plan has several frontends: adding a second one regenerates this package (the harness's
`scaffold` does it), never a hand edit.

<!-- @frontends-end -->
`assemble` fails, naming the cause and the file, when a page's meta allows anything in `script-src`
or `style-src` (or `default-src` where those are absent) other than `'self'`, a hash or
`'strict-dynamic'` (`'unsafe-inline'`, `'unsafe-eval'`, `'unsafe-hashes'`, a nonce, a host, a
scheme, `*`), when any `_headers` file sets or detaches `Content-Security-Policy`, when the output
or `static/` holds a symbolic link, and when the merged `_headers` is over the platform's limits
(100 rules, 2,000 characters per line). A page with no policy meta (a file from the frontend's
`public/`) is served under the fixed header only, with one warning on stderr (count and up to ten
paths). It builds beside `dist/` and swaps, so a failed run leaves the previous `dist/`. Without a
frontend `dist/` holds `static/`'s files only.

A page has no request id. An unknown `/api/x` answers the JSON `not_found` envelope; an unknown page
answers the frontend's 404 page. `dist/` must exist for `wrangler` to start: `dev` uses an empty
folder, `start` assembles first.

<!-- @sdk-start -->
## The SDK

With an SDK package in the plan (`__SDK_PATH__`) the Worker also serves it to the pages that embed
it. Without one none of this exists in the package.

- `/api/sdk/v1/` is the public, cross-origin namespace (`server/api/sdk/`). One gate runs first
  (`middleware/sdk-gate.ts`): CORS for this namespace alone (the origin is echoed once the key step
  admits a key that lists it; never credentials), the `X-Sdk-Key` key, then a rate limit by address
  and by key (`sdkPerIp`, `sdkPerKey`, on the D1 limiter; a preflight counts on the address first).
  The key resolves once to `{ origins, enabled }` (`resolveKey`, `services/security/sdk-keys.ts`,
  async: a product replaces the bodies with a cached lookup), kept on `ctx.sdkKey`. A switched-off
  key gets the 403 envelope everywhere but `GET|HEAD /config`; a lookup that throws answers 500.
  Every answer is `no-store` and varies on `Origin` and `X-Sdk-Key`. A body is at most 64 KB
  (`SDK_MAX_BODY_BYTES`, 413), read after the gate. `GET /api/sdk/v1/config` answers `{ enabled }`:
  `SDK_ENABLED` and the key's own switch. A request is same-origin when it says
  `Sec-Fetch-Site: same-origin`, or says nothing of it and has no `Origin` or one with the request
  URL's host; it then needs a valid key only.
- `POST /api/sdk/v1/telemetry` (`api/sdk/telemetry/`, frame only) takes `{ events }`, 1 to 100
  objects, and answers 204 once `recordSdkTelemetry` (`services/telemetry.ts`) returns, so keep the
  sink short. A sink that throws is logged by class name; the answer stays 204.
- `GET|HEAD /api/sdk/dist/v<major>/<file>.js` and `.css`, and `GET /api/sdk/frame/v<major>?k=<key>`
  (`middleware/sdk-files.ts`), carry no key and are not in the OpenAPI document. The frame document
  has one `Content-Security-Policy`: script, style and connect from itself, images from itself and
  `SDK_IMG_ORIGINS`, `frame-ancestors` the key's origins (`'none'` for an unknown or switched-off
  key, an origin outside the `SDK_KEYS` form, or a failed lookup).
- `bun run assemble` copies the SDK's build (`__SDK_PATH__/__SDK_OUT__`; `SDK_DIR` names another,
  relative to this package) into `dist/api/sdk/dist/v<major>/` and `dist/api/sdk/frame/v<major>`
  (the frame document, without `.html`), and fails on a missing or empty build; `bun run start`
  passes `--allow-missing-sdk` and warns, and both routes then answer 404. The Worker builds each
  response from the assets' body alone, so no `_headers` rule reaches a file. Keep `/api/*` on
  `run_worker_first`; `assemble` refuses an output or `static/` that holds `api/sdk/`, and a
  frontend named `api`.
- Variables: `SDK_KEYS` (`key=origin,origin;key=origin`; unset refuses every request),
  `SDK_ENABLED` (default `true`) and `SDK_IMG_ORIGINS` (`origin,origin`, default none); production
  refuses an `http:` or loopback origin in either list. `.env.example` has local values; a
  deployment sets them in `vars` of `wrangler.jsonc`, then `bun run types`. `bun run start` takes
  them and `SDK_DIR` from the shell.
- `bun run dev` serves the API on an empty asset folder: the files and the frame answer 404 there.

<!-- @sdk-end -->
## Adding an entity

Work in this order, test first. Copy the reference entity (`server/api/entity/`,
`server/models/entity/`, `tests/api/entity.test.ts`), renaming `entity` to `<name>`, `Entity` to
`<Name>`. Drop it (those paths, its lines in `server/openapi.ts` and `server/server.ts`, its table
in a migration) once a real one exists.

1. `server/models/<name>/`: `interface.ts` (the stored record), `type.ts` (public shape, inputs),
   `enum.ts`, `constants.ts` (limits).
2. `server/api/<name>/schema.ts`: the zod schemas, each `satisfies z.ZodType<...>` of its
   `models/` type; one `<operation>Request` object per endpoint (only the parts it reads: `body`,
   `query`, `params`); and `register<Name>(registry)` with a `registerPath` per endpoint. Add
   `register<Name>` to the list in `server/openapi.ts`.
3. `tests/api/<name>.test.ts`, red (see Tests), and the entity's case in `tests/api/routes.test.ts`.
4. `server/api/<name>/model.ts` (the table), then `bun run db:generate -- --name <name>` and
   `bun run migrate` (see Adding the data layer).
5. `service.ts`: queries taking `db` as their first parameter.
6. `controller.ts`: one handler per endpoint, then the rules other entities need.
7. `routes.ts`: a `Hono<AppEnv>` router, one `routes.<method>(path, handle(...gates, controller))`
   per endpoint and one `routes.all(path, methodNotAllowed(...))` per path, exported as default;
   then `app.route('/api/<name>', <name>Routes)` in `server/server.ts`. A list route is
   `validate(list<Name>Request)`; a write is `rateLimit(...)` then `validate(...)`. A table in a file
   other than `server/api/*/model.ts` goes in `drizzle.config.ts`'s `schema`.
8. `bun run openapi`, then `bun run check`; commit `openapi.json` and the migration.

- One request object, two readers: `validate(<operation>Request)` in the routes.ts and
  `readInput(ctx, <operation>Request)` in the handler.
- A list paginates: `PageQuery` and `pageOf` from `services/utils/pagination.ts`, the service
  fetches `limit + 1` rows and `toPage` slices, the cursor is opaque. Bodies are JSON only. Statuses: 200 read and update, 201 create, 204
  delete, 400 validation, 404 missing, 405 wrong method, 409 conflict, 429 rate limited.
- Admin endpoints live in `server/api/admin/<name>/`, an entity like any other, at `/api/admin/<name>`
  (`admin` is a namespace, not an entity); mount its router in `server/api/admin/routes.ts`
  (`routes.route('/<name>', <name>Routes)`). That file's one gate refuses every request (403) until
  the product replaces it with its own.
<!-- @sdk-start -->
- SDK endpoints live in `server/api/sdk/<name>/`, an entity like any other, at
  `/api/sdk/v1/<name>` (`sdk` is a namespace); mount its router in `server/api/sdk/routes.ts`
  (`routes.route('/<name>', <name>Routes)`). That file runs `middleware/sdk-gate.ts` first (see The
  SDK). A write from the frame is an entity behind `frameOnly` (`routes.use('/<name>/*', frameOnly)`;
  the `/*` matters) with a rate limit of its own on its route; one mounted without it is readable by
  the host page. Within `v1` the namespace only adds; a removal or a change is a `v2` beside it.
<!-- @sdk-end -->
- Ids are made in the controller (`crypto.randomUUID()`), never by the database or the client.
- A rate limit is a gate (`rateLimit({ name, limit, window, key })`) with its numbers in
  `RATE_LIMITS`; `byIp` keys an IPv6 address by its /64 network. Every mutation carries one, with
  its own name and counter (`createEntityPerIp`, `updateEntityPerIp`, `deleteEntityPerIp`).

## Adding the data layer

D1 through Drizzle is part of the base. A table is `server/api/<entity>/model.ts`; the platform
layers' own tables are `server/infra/tables.ts`. `drizzle.config.ts` reads both.

- **Adding a table.** Write the `sqliteTable` in the entity's `model.ts`, run
  `bun run db:generate -- --name <name>` (SQL lands in `migrations/`; commit it with the model), then
  `bun run migrate`. Never edit an applied migration: add a new one.
- **Ids and timestamps.** Ids are `text` (a UUID made in the controller). Timestamps are
  `integer({ mode: 'timestamp_ms' })` columns (epoch milliseconds, read back as `Date`). Table and
  column names are snake_case singular, fields camelCase in code. Index names say what they cover
  (`entity_created_at_id_idx`).
- **No interactive transaction.** D1 offers none, so a rule that must not race is one of three
  patterns: a conditional statement (`UPDATE ... WHERE <still true> ... RETURNING`: no row back means
  it failed); an upsert (`insert ... onConflictDoUpdate ... returning`, as the rate limiter
  does with `RETURNING count`); or `db.batch([...])`, which runs its statements in one implicit
  transaction and counts as one query of the invocation's budget.
- **Limits that bite.** 100 bound parameters per query (a bulk insert is chunked), 50 queries per
  invocation on the free plan and 1,000 on the paid one, 2 MB per row (checked 2026-11-17).
- **Expiry.** A row that expires carries an indexed `expiresAt` column. Reads ignore expired rows,
  and a bounded batch is deleted after one request in twenty that the limiter lets through, never
  one answered 429 (`waitUntil`, `rate-limit-cleanup.ts`; `rateLimit` takes a `sample` function so
  a test is deterministic); the `jobs` flag adds a scheduled sweep for the rest.
- **The test database.** Tests run on a D1 with the migrations applied (see Tests); the e2e state is
  `.e2e-state`, rebuilt by `bun run e2e:db`.
- **Never.** A module-level client (`infra/db.ts` builds one per request from the binding); reading
  `process.env`; a `--remote` flag in any script or test. A person creates and migrates remote
  databases (see Deployment).

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
  `server/bun-express`'s, because Hono does not answer a missing method itself: each routes.ts does,
  per path.
- A ZodError that escapes is a 400. Anything else is logged with its stack and leaves as a bare
  `internal` envelope: no message, stack or query text reaches the client. A D1 failure the
  controller can name (a unique violation) is caught there and thrown as `conflict`.
- Every API response carries `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
  and `Cross-Origin-Resource-Policy: same-origin`; a static file never does.
- Logging is `ctx.log`. Never put a header, a body, a secret or a query parameter in a field. A
  failed Drizzle query is logged with its query text (placeholders) and the database's own
  message, never its parameters.
- Health: `GET /api/health` (no store) and `GET /api/health/ready` (pings D1, 503 with the map).
- Every endpoint's test covers its validation failure and its not-found path, asserting the
  envelope's `code` and `requestId`, not only the status.

## Tests

`bun run test` runs two vitest projects. `unit` runs in Node (`tests/unit/`): pure code, the import
boundaries, `wrangler.jsonc`, the contract, `assemble` on fixture output and `start` on a fixture
build (it starts `wrangler dev` on a port the OS chooses, with its own output and state folders in
a temp directory, so `check` never swaps this package's `dist/`, and ends it). `api` runs in workerd (`tests/api/`, `bun run test:db`): the Worker's own
entry (`server/index.ts`, `main` of the project; nothing is built first), against a D1 with the
migrations applied. Bindings for the run (`ENVIRONMENT: test`) are in `vitest.config.ts`.

- `tests/api/helpers.ts`: `send(path, { method, body, headers })` returns the `Response` from the
  Worker's entry; `json(response)` reads it; `through(handler, path, { bindings, route })` runs one
  handler built in the test in a fresh root app, for what no route exercises (a probe that throws, a
  production environment, a broken database, a fake binding; `route` names the Hono path when the
  test reads parameters); `mounted(routes, base)` mounts one entity's router alone; `settle` awaits
  what the code gave to `waitUntil`.
- Storage is isolated per test file: `tests/api/setup.ts` empties every table before each test.
- **Long paths on Windows** (observed): wrangler's local D1 file is
  `.e2e-state\v3\d1\miniflare-D1DatabaseObject\<64 hex>.sqlite` (and under `.wrangler\state\`).
  Under a package path of about 140 characters it passed 260 characters and `bun run e2e:db` or
  `bun run migrate` failed with only `internal error; reference = ...`: use a shorter project path.
- A test never starts a listener of its own (`start.test.ts` starts the real script) and never calls
  a remote binding; it fakes a new one (see Migrating Pages Functions, step 5).
- `RATE_LIMIT_SCALE` (1 to 1000, default 1) multiplies every limit in `RATE_LIMITS`; an e2e run
  raises it. No switch turns limiting off.
- Tests first: write the failing test, see it red, then the code; each behaviour has a happy path
  and a failure or empty one. No `.skip`, `.only`, `.todo`, `.skipIf` or test-name filter in a gate
  command; a removed test is named and justified in the stage report. `bun run check` never needs
  Docker or an account.

## Deployment

A person deploys; an agent never does. The hooks of a harness project refuse `wrangler deploy`,
`login`, `secret`, `delete` and any command with `--remote` for an agent: report what is needed and
stop. No script or test of the template deploys or reaches a remote binding. Not proven on a
deployed Worker (no account): the first deployment is the proof.

1. **The Worker.** Connect the repository to Workers Builds, or run `wrangler deploy` from this
   directory. Always name the environment: `--env production` deploys a Worker named
   `<name>-production` and `--env preview` one named `<name>-preview`, each with its own address and
   database (the top-level database is the fake development one). Set `name` in `wrangler.jsonc`
   to the project's name. Workers Builds settings:

<!-- @frontend-start -->
   | Setting | With the frontend of this project |
   | --- | --- |
   | Root directory | the path of this package from the repository root (`__PACKAGE_DIR__`) |
   | Build command | `(cd __FRONTEND_PATH__ && bun install --frozen-lockfile && bun run build) && bun install --frozen-lockfile && bun run assemble` | <!-- @nofrontends -->
   | Build command | the same `(cd <path> && ... bun run build)` for each frontend (`__FRONTEND_PATH__` and the others), then `bun install --frozen-lockfile && bun run assemble` | <!-- @frontends -->
   | Deploy command | `bunx wrangler deploy --env production` |
   | Build variables | `NODE_VERSION=24`, `BUN_VERSION` of 1.4 or later |
<!-- @frontend-end -->
<!-- @nofrontend-start -->
   | Setting | Without a frontend |
   | --- | --- |
   | Root directory | the path of this package from the repository root (`__PACKAGE_DIR__`) |
   | Build command | `bun install --frozen-lockfile && bun run assemble` |
   | Deploy command | `bunx wrangler deploy --env production` |
   | Build variables | `NODE_VERSION=24`, `BUN_VERSION` of 1.4 or later |
<!-- @nofrontend-end -->

<!-- @sdk-start -->
   With an SDK package, build it first: put
   `(cd __SDK_PATH__ && bun install --frozen-lockfile && bun run build) &&` in front of the build
   command above. Add `SDK_KEYS`, `SDK_ENABLED` and `SDK_IMG_ORIGINS` to `vars` of
   `env.preview` and `env.production`:
   they are publishable, not secrets, and a value in the dashboard is overwritten by the next
   deploy.
<!-- @sdk-end -->
   `assemble` writes the `dist/` that `assets.directory` names, so it runs before the deploy. The
   build image's default Node is older than this package's `engines`, hence `NODE_VERSION`
   (confirm on the first build). `wrangler.jsonc`, not the dashboard, owns bindings and plain
   variables (secrets stay in the dashboard). The environments inherit `main`, `assets` and
   `triggers`; every other key (`vars`, `d1_databases`, `ai`, `services`, ...) is restated in
   `env.preview` and `env.production`.
2. **The databases.** `wrangler d1 create <project>-preview` and `<project>-production`; put each
   printed id into its environment of `wrangler.jsonc` (the development id stays fake: that database
   is local only), so a preview never runs against production data.
3. **Secrets, per environment** (the Worker's Settings, or `wrangler secret put --env <name>`, a
   person's command): none until a feature needs one. `ENCRYPTION_KEY` (`openssl rand -base64 32`,
   different in each environment) is optional with no default: set it when the first feature calls
   `encrypt` (through `requireEncryptionKey(ctx.env)`); a value that is set must be valid.
   `ENVIRONMENT` comes from `wrangler.jsonc`; `RATE_LIMIT_SCALE` and `LOG_LEVEL` are plain variables.
4. **Migrations.** A remote database is migrated by hand, after an export:
   `wrangler d1 export <database> --remote --output backup.sql`, then
   `wrangler d1 migrations apply <project>-preview --remote`, naming the database (the top-level
   `DB` entry is the fake development one; whether your wrangler also takes `--env preview` is not
   proven here: read what it prints before confirming). Apply to `preview` first, then
   `<project>-production`. Nothing in the template does it for a deploy.
5. **Check the first deployment.** A page carries its policy meta, the fixed
   `Content-Security-Policy` header and the static headers (`curl -I` on a page); `/api/health`
   answers 200 with an `x-request-id`; a static page has none; an unknown page answers the 404 page
   with status 404; `/about` and `/about/` answer as intended (see the frontend's guide).
6. **Two limits Pages did not have.** A custom domain must sit in a Cloudflare zone (Pages took a
   CNAME from any DNS); a preview address is one host, so it shows one frontend.
<!-- @frontends-start -->
   Beside several frontends set `FRONTEND_HOSTS` (`host=dir,host=dir`, each frontend at least once) in
   `env.preview` and `env.production`: it is empty there, so until it is filled every request,
   `/api/health` included, answers 500. A value set in the dashboard is overwritten by the next
   deploy: the file is the place.
<!-- @frontends-end -->
7. **Platform limits** (developers.cloudflare.com, checked 2026-11-22): a `_headers` file holds 100
   rules of 2,000 characters; `_redirects` 2,000 static and 100 dynamic rules; assets are limited in
   count and size by plan; the Worker runs 10 ms CPU a request on the free plan (nothing here hashes
   a password).
<!-- @jobs-start -->
8. **The cron trigger** (flag `jobs`): `triggers.crons` deploys with the Worker and each environment
   inherits it, so each runs the job on its own database, hourly. See Jobs.
<!-- @jobs-end -->

**Local secrets.** `wrangler dev` reads `.env` in this directory (copy `.env.example`; it is
git-ignored). Never create a `.dev.vars` beside it: where that file exists, `.env` is ignored
whole. A value in `.env` overrides the same key in `wrangler.jsonc`; every key becomes a binding.

## Moving from Pages Functions

For a project generated from this package's 1.0.0 (`functions/`, `pages/`, `workers/jobs/`), after
Cloudflare's guide "Migrate from Pages to Workers". Each step leaves `bun run check` green.

1. **Configuration.** In `wrangler.jsonc` remove `pages_build_output_dir`; add `main`
   (`server/index.ts`) and `assets` (`directory: "dist"`, `binding: "ASSETS"`,
   `not_found_handling: "404-page"`, `run_worker_first: ["/api/*"]`); run `bun run types`.
2. **Routing.** Add `hono` (exact pin), `server/middleware/handler.ts`, `server/server.ts`,
   `server/index.ts`, the lint zones and the tests. Each `functions/api/<name>/*.ts` becomes the
   entity's `routes.ts` (`onRequestGet = handle(...)` becomes `routes.get(path, handle(...))`,
   `onRequest = methodNotAllowed(...)` becomes `routes.all(path, ...)`, `[id]` becomes `/:id`,
   `[[path]].ts` becomes the `not_found` line of `server.ts`). Then delete `functions/`.
3. **Static files and jobs.** `pages/` becomes `static/`, `_routes.json` goes, `assemble`'s `pages`
   option becomes `statics`, a route outside `/api` goes in `assets.run_worker_first` too.
   `workers/jobs/index.ts` becomes `scheduled` in `server/index.ts`, its cron moves to
   `triggers.crons`, the second Worker goes; a person deletes the old Worker after the first
   deployment of the new one.
4. **Scripts and tests.** `dev` and `start` run `wrangler dev`; the `api` project's `main` is
   `./server/index.ts`.
5. **Deployment** (a person). Create the Worker (Deployment, step 1) beside the Pages project on the
   same D1 databases, check its address, move the custom domain, disable the Pages project's
   automatic deployments, then delete it. Workers Builds does not share the Pages project's
   variables: restate them. Move before adding a second frontend.

## Scaling out

One Worker holds every entity until traffic has been measured and the business decides to scale. A
project then moves one step at a time; the rules in Import direction make each a change of wiring,
not a rewrite.

- **An entity in a Worker of its own.** Give it an entry (`server/<name>.ts`: `rootApp()`,
  `app.route('/api/<name>', <name>Routes)`, a default export with `fetch`) and a second
  `wrangler.jsonc` (its own `name` and `main`, the same D1 binding, no assets). The first Worker
  stops mounting the router and forwards `/api/<name>/*` by a Cloudflare route or a service binding
  (`app.all('/api/<name>/*', (c) => c.env.<NAME>.fetch(c.req.raw))`).
- **A service binding for the rules it calls.** After the move, the callee exposes the rule from a
  `WorkerEntrypoint` and the caller replaces the controller import by `env.<CALLEE>.<rule>(input)`:
  only that line changes, because the rule is async and takes and returns plain data.
- **A Worker per frontend.** When static requests become the cost (beside several frontends the
  Worker runs for every path), deploy the same code once per frontend, each with its own
  `assets.directory` and address.

Each Worker adds a deployment and version skew.
<!-- @sdk-start -->

With an SDK, each admitted namespace request writes the limiter to D1 twice (address, then key). The
per-key limit (`sdkPerKey`, per minute) is a ceiling for
one integration's whole audience and is the product's to size; at that traffic move the counters off
D1 (a Workers rate-limiting binding or a Durable Object).
<!-- @sdk-end -->
<!-- @jobs-start -->

## Jobs

The `jobs` flag adds `scheduled` to `server/index.ts` and `triggers.crons` to `wrangler.jsonc`: one
cron trigger and one handler in the same Worker, deleting expired rate-limit rows in bounded
batches (`server/middleware/rate-limit-cleanup.ts`, which the request path also calls; the bound is
`RATE_LIMIT_PURGE_MAX_BATCHES`). `tests/unit/jobs-config.test.ts` asserts the trigger and no second
Worker; `tests/api/jobs.test.ts` calls the handler in workerd. A second job is one more call in
`scheduled`, its logic an exported rule of a controller, its own test.

Run it locally on the database `bun run migrate` prepared: `bun run dev`, then request
`/cdn-cgi/handler/scheduled` on its port. A person deploys the Worker.

<!-- @jobs-end -->

## Migrating Pages Functions

For an existing Pages site that moves into this package: JavaScript Functions with their logic in a
`functions/api/_lib/` folder, a hand-migrated D1 database that holds data, Git-connected builds
whose previews share the live data. Each step is one task, in this order, and leaves `bun run
check` green and the site deployable; a person does what Deployment says is a person's.

1. **A preview environment on its own database first.** Give `env.preview` its own D1 database
   (Deployment, step 2), seeded from an export of production (a person's commands: `d1 export`,
   then `d1 execute <preview> --file backup.sql`).
2. **Baseline the existing database's migrations without running them.** The migrations folder must
   describe what the database already has, and the database must be told so.
   - Make `server/api/<entity>/model.ts` match each live table (compare with
     `wrangler d1 execute DB --remote --command "SELECT name, sql FROM sqlite_master"`), delete the
     reference entity and the template's `migrations/0000_init.sql` with `migrations/meta/`, keep
     `rateLimitTable` out of this one generate (comment its export in `server/infra/tables.ts`), run
     `bun run db:generate -- --name baseline`, restore the table and run
     `bun run db:generate -- --name rate_limit`: `0000_baseline.sql` is the existing schema and
     `0001_rate_limit.sql` is new.
   - Register `0000_baseline.sql` as applied, locally first (load the export with
     `wrangler d1 execute DB --local --file backup.sql`):

     ```
     wrangler d1 execute DB --local --command "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL); INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0000_baseline.sql');"
     wrangler d1 migrations apply DB --local
     wrangler d1 migrations list DB --local
     ```

     Only `0001_rate_limit.sql` is applied. A person runs the same three commands with `--remote`
     (preview, then production; Deployment, step 4), after the export, once, and only against a
     database that really has the baseline's tables.
3. **Move the logic into `server/`, one endpoint at a time.** `allowJs` is on and `checkJs` off, so
   JavaScript can live in `server/` first (`// @ts-check` opts a file in). For each endpoint, as
   one task: a test in `tests/api/<name>.test.ts` through `send()` that pins the current behaviour
   and passes against the old function; the logic moves from `_lib` into the layers
   (`context.env.X` becomes `ctx.env` through `config/env.ts`); the route becomes
   `routes.post('/', handle(validate(...), controller))` and the old
   `functions/api/<name>.js` is deleted; the endpoint is registered in `schema.ts` and
   `bun run openapi` is run; the envelope replaces any ad-hoc error body (change the site's own
   callers in the same task, or the test records the difference). When no `_lib` file is left,
   delete the folder.
4. **Routes outside `/api`** (two that answer HTML, say): a router like an entity's mounted at its
   path in `server/server.ts`, and the path added to `assets.run_worker_first`. The root middleware
   wraps `/api/*` only, so such a route sets its own `content-type`, `cache-control` and
   `Content-Security-Policy`.
5. **Other bindings.** Declare each in `wrangler.jsonc` (`ai`, `services`) at the top level and in
   both environments; run `bun run types`; add an accessor in `server/infra/bindings.ts` that throws
   when the binding is missing (as `d1()` does). In tests, pass `{ ...env, AI: fake }` as
   `bindings` to `through()`. Workers AI has no local engine.
6. **An admin area behind Cloudflare Access.** `/api/admin` ships with a gate that refuses every
   request: replace `server/middleware/admin-gate.ts` with one that verifies the
   `Cf-Access-Jwt-Assertion` header (signature against
   `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, the application's AUD tag, expiry)
   and refuses with an `AppError`; team domain and AUD tag are plain variables in `config/env.ts`.
   An admin page beside several frontends is the `admin` frontend. A JWT library is a plan
   decision; test with a locally signed token.
7. **What not to migrate.** The request id, error envelope, security headers, request log, rate
   limiter and CORS helpers a `_lib` folder grew, dashboard-set bindings `wrangler.jsonc` now owns,
   a second database client, a `wrangler.toml`. Pages and redirects move with the frontend's guide.

