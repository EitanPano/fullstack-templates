# Changelog

## 4.1.0 — 2026-11-25

### Added

- With an `sdk` package in the plan ([ADR 0020](../../docs/adr/0020-sdk-kind.md) N1 to N5; without one the generated package is unchanged):
  - the SDK namespace `api/sdk/`, mounted at `/api/sdk/v1`, an entity of it being `api/sdk/<entity>/`. `middleware/sdk-gate.ts` runs first: CORS for the namespace alone (origin echoed only for a request the key step admits, `Vary: Origin`, never credentials, `Access-Control-Max-Age: 600`), the `X-Sdk-Key` key resolved once by `services/security/sdk-keys.ts` (async: `resolveKey` gives `{ origins, enabled }`, `isListedOrigin` a boolean; a lookup that throws is a 500, a key with `enabled: false` is a 403 except on a GET or HEAD of `/config`; both lookups answer from a cache, misses too), then the rate limit by key and address (`sdkPerKey`, `sdkPerIp` in `RATE_LIMITS`). A same-origin request (`Sec-Fetch-Site: same-origin`; without that header, no `Origin` or an `Origin` whose host equals the raw `Host` header) needs a valid key only and gets no allow-origin header (`isSameOrigin`). No cookie is read. The project's `CORS_ORIGINS` layer skips `/api/sdk/` (it would answer the namespace's preflights and add credentials), and every answer of the namespace carries `Cache-Control: no-store` and `Vary: Origin, X-Sdk-Key`. The gate counts a preflight on the address limit before any lookup (a 429 carries no allow header); the body parser runs after the gate and the `frameOnly` guard; `frameOnly` and `endPreflight` mount an entity only the frame may call; production refuses an `http` or loopback origin in `SDK_KEYS`.
  - `GET /api/sdk/v1/config` answers `{ enabled }` from `SDK_ENABLED` and the key's own switch; it is in `openapi.json` with the key header and the 403 and 429 answers.
  - `POST /api/sdk/v1/telemetry` (`api/sdk/telemetry/`, frame only): 1 to 100 JSON objects in `events`, answered 204; the sink `services/telemetry.ts` (`recordSdkTelemetry`) logs a count, is awaited before the 204 (a throw is logged by its class name and still answers 204) and is the product's to replace. A request body under `/api/sdk/v1/` is at most 65,536 bytes (`SDK_MAX_BODY_BYTES`), read after the key gate; `server.ts` leaves the namespace to its own parser.
  - `GET|HEAD /api/sdk/dist/v<major>/<file>.js` and `<file>.css` and `GET /api/sdk/frame/v<major>?k=<key>` (`middleware/sdk-files.ts`), from `SDK_DIR`, outside the key gate and outside the OpenAPI document. The frame carries one `Content-Security-Policy` (own script, style and images plus `SDK_IMG_ORIGINS`, own origin for `connect-src`; `frame-ancestors` are the key's origins, `'none'` for an unknown or switched-off key, a record with an origin outside the `SDK_KEYS` form, or a failed lookup, which is logged as a warning), `Referrer-Policy: no-referrer`, no `X-Frame-Options`, `Cache-Control: no-store`. A script or stylesheet carries Express's weak `ETag`, and a request that holds it gets 304. A 429 on a `frameOnly` path carries no allow-origin header.
  - `SDK_KEYS`, `SDK_ENABLED`, `SDK_IMG_ORIGINS` and `SDK_DIR` in `config/env.ts` (`SDK_IMG_ORIGINS`: origins in the same closed form, comma separated, https only in production): a malformed `SDK_KEYS` stops the boot naming the variable and never the key; each origin must be `scheme://host[:port]` in lower case.
  - the Dockerfile copies the SDK's build from the `sdk` build context and sets `SDK_DIR`; `compose.yaml` adds that context in both deploy modes (Compose 2.35.0 or later) and passes `SDK_KEYS`, `SDK_ENABLED` and `SDK_IMG_ORIGINS`.
  - the layer lint treats `api/sdk/<entity>/` as it treats `api/admin/<entity>/`.
  - the `sdk` and `sdk-postgres` cases in `tests/cases.yaml`. The SDK suites clear the cache only, never the store: with a database the store seam refuses a non-test one, which failed `check` on a fresh scaffold.

## 4.0.0 — 2026-11-24

### Changed (breaking)

- The architecture unit is an entity, not a module ([ADR 0018](../../docs/adr/0018-entity-term-and-service-facades.md) E1, E2): `api/<entity>/`, `api/admin/<entity>/`, the `Adding an entity` heading of `AGENTS.md`, the lint messages and the comments say so. "Module" stays only in its language sense. Behaviour, the error envelope and the status codes are unchanged; the sample's 404 message is `entity not found`.
- The sample a developer copies is named `entity`. To rename a project generated earlier, by hand:
  - directories `src/api/module/` → `src/api/entity/` and `src/models/module/` → `src/models/entity/`; the test file `tests/module.test.ts` → `tests/entity.test.ts`;
  - the route `/api/module` → `/api/entity` (`config/routes.ts` and the OpenAPI paths and tag), so `openapi.json` and the frontend's generated client change: regenerate them with the `openapi` and `contract` commands;
  - the event `module.created` → `entity.created` and its payload `moduleId` → `entityId` (`services/event.ts`, the controller, the tests);
  - the OpenAPI components `Module` → `Entity`, `ModulePage` → `EntityPage` (and `CreateModuleBody`, `UpdateModuleBody`);
  - the identifiers, case kept: `ModuleRecord` → `EntityRecord`, `ModuleStatus` → `EntityStatus`, `PublicModule` → `PublicEntity`, `CreateModuleInput` → `CreateEntityInput`, `UpdateModuleInput` → `UpdateEntityInput`, `MODULE_LIMITS` → `ENTITY_LIMITS`, `moduleRoutes` → `entityRoutes`, `registerModule` → `registerEntity`, `ModuleIdParams` → `EntityIdParams`, `ListModuleQuery` → `ListEntityQuery`, `listModuleRequest` → `listEntityRequest` (and `get`, `create`, `update`, `delete` alike), the handlers `listModule`, `getModule`, `createModule`, `updateModule`, `deleteModule` → the `Entity` spelling, the service functions `listModules` → `listEntities`, `findModuleById` → `findEntityById`, `createModule`, `updateModule`, `deleteModule`, and the row type `ModuleRow` → `EntityRow`.
  - With `postgres`: the first migration creates the table `entity` and the index `entity_created_at_id_idx` (edited in place). A database that applied the old `0001-init.sql` keeps `module` and `module_created_at_id_idx` until a new migration renames them (`alter table module rename to entity`, `alter index module_created_at_id_idx rename to entity_created_at_id_idx`).
- The role-change line in `AGENTS.md` names the role list in this package's `.doc/architecture.md` instead of "this file" ([ADR 0019](../../docs/adr/0019-package-docs.md)). A project generated earlier changes "role; this file. The frontend's role type guard" by hand.

## 3.2.0 — 2026-11-22

### Added

- The admin namespace ([ADR 0015](../../docs/adr/0015-several-frontends-by-directory.md) A1): `api/admin/routes.ts` is the router mounted at `/api/admin` by `config/routes.ts`, and an admin module is `api/admin/<name>/` at `/api/admin/<name>`, its router mounted in that file. One gate runs first on the whole prefix, the same in every environment: with `auth`, `requireRole('admin')` (401 without a session, 403 for another role, the JSON 404 for an unknown path only once admitted); without `auth`, every request is refused with 403 until the product writes its own gate. No admin module ships and `openapi.json` is unchanged.
- The ESLint zones treat `api/admin/<name>/` as a module: it reaches an entity's data through that entity's `controller.ts`, no `service.ts` is imported from outside its module, and `api/admin/routes.ts` may import the admin modules' `routes.ts`. `tests/admin.test.ts` and `tests/boundaries.test.ts` prove both.

## 3.1.0 — 2026-11-12

### Added

- A 401 for a request with no valid access token (`authentication required`) carries `WWW-Authenticate: Bearer`, built by `authenticationRequired()` in `services/utils/error.ts`; wrong credentials, an invalid refresh token and an invalid code carry none, so a client can refresh on the header alone. `AppError` takes optional `headers`, applied by `middleware/error-handler.ts`; the envelope is unchanged.

## 3.0.0 — 2026-11-12

### Changed (breaking)

- The sign-up endpoint is `POST /api/auth/signup`, not `/api/auth/register`; method, request, responses, status codes and rate limits are unchanged.
- Renamed: `register` → `signup` (controller), `registerRequest` → `signupRequest`, `registerLimiter` → `signupLimiter`, `validateRegister` → `validateSignup`, rate limit `registerPerIp` → `signupPerIp` (`RATE_LIMITS` and the limiter name), event `user.registered` → `user.signedup` (`services/event.ts`, `send-welcome` subscriber). No environment variable changes.
- Migration for a project generated earlier: rename the route and the names above, or keep the old path; regenerate the frontend's client (`openapi.json` names `/api/auth/signup`).

## 2.4.3 — 2026-11-07

### Fixed

- `single` mode caches a frontend's hashed build output immutable whatever its layout: `assets/*` (Vite), `media/*` and the root bundles `main-`, `polyfills-`, `chunk-`, `styles-` plus an eight-character hash (Angular). Every other file still revalidates.

## 2.4.2 — 2026-10-29

### Fixed

- The root `.gitignore` no longer lists `.next/` and `next-env.d.ts`: they moved out of the shared `node` section into a `next` section that only `frontend/next` declares.

## 2.4.1 — 2026-10-29

Documentation only.

- `AGENTS.md` keeps a `withTransaction` example in the text and stops pointing at the reference module once it is dropped (copy your first module instead).
- `AGENTS.md › Authentication` says what to update when a product renames the roles `user` and `admin`.

## 2.4.0 — 2026-10-26

- New command `start` (`bun run start`): the server without a watcher or reloader, which a frontend's e2e starts.
- `RATE_LIMIT_SCALE` (a number from 1 to 1000, default 1, read once in `config/env.ts`, listed in
  `.env.example`) multiplies every limit in `RATE_LIMITS`, rounded up; `rateLimit` applies it, with
  an optional `scale` option for a caller that needs another. An e2e run raises it so a journey
  suite does not meet the limits; production keeps 1. There is no bypass switch. The same in the
  python-fastapi template.
- With the Postgres capability, a new command `e2eDb` (`bun run db:e2e`) prepares the e2e database
  that the provider's `e2e` URL names (`app_e2e`, overridden by `E2E_DATABASE_URL`, parsed in
  `config/env.ts`). It creates the database when it is missing, applies the migrations and
  truncates every table except `schema_migration`, and refuses any database whose name does not
  end in `_e2e`.
- The Compose fragment writes the app secrets as `${NAME-}`, so `docker compose up -d --wait
  database` prints no "variable is not set" warning for them. An unset secret is still an empty
  string, and the server still refuses to boot in production without it.
- Tests that raise an error on purpose capture it (`captureLogs` in `tests/logs.ts`, or a console
  spy), so a green run prints no stack trace. `tests/services/session.test.ts` changed, and the
  Postgres overlay's copy and its pin with it.

## 2.3.1 — 2026-10-25

- `byIp` limits an IPv6 client by its /64, not its full address: a subscriber owns a whole /64, so
  rotating addresses inside it no longer dodges a per-IP limit. An IPv4 address is unchanged, an
  IPv4-mapped IPv6 address (`::ffff:203.0.113.5`) is its IPv4, and anything that is not an address
  is unchanged. `rateLimitSubject` in `middleware/rate-limit.ts` does the mapping; the hashing and
  the cache key are as before. The same rule is in the python-fastapi template.

## 2.3.0 — 2026-10-24

- Static serving of a built single-page app, shipped in every project and inert unless `STATIC_DIR`
  is set (blank is unset; in production a directory without `index.html` stops the boot with
  `invalid environment: STATIC_DIR: <dir> has no index.html`). `src/middleware/static.ts` serves it
  after the API routes and `/openapi.json`: files from the directory (`assets/*` immutable for a
  year, `index.html` `no-cache`), `index.html` for any extension-less path outside `/api`, and the
  404 envelope for a missing file with an extension, another method, a dotfile, an encoded
  traversal, a symlink out of the directory and a directory (never a listing). `/api` is decided on
  the once-decoded path, so `/%61pi/x` is not the shell. Every static response carries the security
  headers and the request id. The behaviour is the same as in the python-fastapi template, one test
  per row in each.
- The `Dockerfile` and the Compose fragment gain `single` deploy-mode lines (generated only when the
  frontend is built into the server's image): the SPA copied from the frontend's `dist` build
  context into `public/` for the `bun` user, `STATIC_DIR=/app/public`, `TRUST_PROXY` defaulting to
  `false`, and the port published on every interface. The `split` shape is unchanged; the Compose
  comments are now per mode and no longer say the Next.js server is the only client.
- `AGENTS.md › Deployment` states both modes: the image and the lines each carries, `STATIC_DIR`,
  the behaviour table, ports, `TRUST_PROXY` per mode and in production, the Compose 2.35.0 floor for
  `single` and `docker compose --profile app down`.
- A file outside `assets/` (`/favicon.ico`, `/robots.txt`) is sent with `Cache-Control: no-cache`, the
  same as `index.html` and the nginx edge; it had been `public, max-age=0`.
- `createApp(staticDir?)` is exported from `server.ts` (defaulting to `STATIC_DIR`), so a test
  builds an app over a fixture directory.
- `AGENTS.md › Deployment` lists the Compose and `Dockerfile` lines of both modes verbatim from `compose.yaml` and the `Dockerfile`, so a project generated in one mode can be moved to the other; a unit test keeps them equal to the files.

## 2.2.0 — 2026-10-23

- The development and test database URLs default to `127.0.0.1`, not `localhost`: the Compose service
  publishes on IPv4 loopback only and Windows resolves `localhost` to `::1` first, which cost about
  2 s per connection.
- With `database/postgres`, the root `docker-compose.yml` gets a derived one-shot
  `backend-migrate` service on the app profile: the backend's image running `db:migrate` with
  the backend's environment, which the backend waits on (`service_completed_successfully`).
  `docker compose --profile app up --build` now applies the migrations before the backend
  starts, and the backend does not start if they fail. `bun run db:migrate` stays for local
  development. `AGENTS.md` and the README replace the `run --rm backend bun run db:migrate`
  instruction with `docker compose --profile app run --rm backend-migrate`, which needs the
  production secrets exported as the app does.
- `AGENTS.md › Tests` lists every form that skips or filters a test (`.todo`, `.skipIf`,
  `.failing`, `xit`, a test-name filter and the others), which the harness's guardrails cite.
- The Postgres capability pins the base files its overlay shadows, so a change to one of them
  in `base/` is noticed instead of silently losing to the overlay.
- A new case, `stack-auth-off-postgres` (`next-bun-express`, `auth: false`,
  `database: postgres`).

## 2.1.0 — 2026-10-22

- The `database/postgres` capability. With `--capability database=postgres` the overlay
  replaces `services/db.ts` (`getDb()`, `Executor`) and every module's `service.ts` (and
  `services/session.ts` with `auth`) with Postgres queries over Bun's built-in `SQL`; adds
  `infra/postgres.ts` (a `Resource`, in `dependencies` beside `memory`, which stays the
  cache), SQL migrations in `src/infra/migrations/` applied by `infra/scripts/migrate.ts`
  (`bun run db:migrate`, with a `schema_migration` table and an advisory lock), and
  `services/utils/postgres-error.ts`, which the error handler uses to answer 503
  `upstream_unavailable` for an unreachable database and 409 `conflict` for a unique
  violation. Query functions take an optional last `Executor`, and a module's `service.ts`
  exports `withTransaction`. Tests get `bun run test:db`, which runs everything against the
  `app_test` database.
- The store test seam in `base/`: `tests/store.ts` (`describeStore`, `resetStore`,
  `recordExists`, `deleteRecord`). No test moved; the suites that touched the store call the
  seam. The overlay replaces it so that `describeStore` skips unless the database is named
  `*_test`.
- `DATABASE_URL` is a secret in `config/env.ts`: required in production, defaulted to the
  local service elsewhere. Without a database nothing changes in a generated project. The
  new markers `@database` and `@database:postgres` (and `@nodatabase`) mark the files that
  differ: `env.ts`, `infra/dependency.ts`, `infra/memory.ts`, `error-handler.ts`, `compose.yaml`
  and the tests that follow them.
- In Compose the backend gets `DATABASE_URL` as plain `${DATABASE_URL}`, with no default, so
  the full stack never boots on the bundled credentials without an explicit export. Nothing
  runs the migrations on boot; `AGENTS.md` and the README say when to run `db:migrate`.
  `test:db` exits 1 when it would skip every store-backed suite.
- `AGENTS.md` describes the Postgres variant, and corrects two statements: a query takes the
  `Executor` as an optional last argument (a controller cannot import `services/db.ts`, so a
  module exports `withTransaction`), and the test database is reached through `test:db`'s
  preload and the seam `tests/store.ts`.

## 2.0.0 — 2026-10-22

- `api/<module>/route.ts` is now `routes.ts`: a default-exported `Router` whose middleware
  (rate limiters, validators, role gates) is built once as named constants and whose endpoints
  are one line each, ending in a handler from `controller.ts`.
- `controller.ts` holds the business logic. Each handler, a `(req, res)` function named after
  its operation with no suffix (`createModule`, `getMe`, `login`), holds its endpoint's logic:
  rules, writes through `service.ts`, events, provider calls. Logic another module, a job, a
  subscriber or a script needs is exported as a typed rule function under a name no handler
  uses; those rules are the module's only public API. The user and auth rules that only their
  own handlers called (`updateMe`, `listUser`, `getUser`, `register`, `login`, `refresh`,
  `logout`, `requestOtp`, `verifyOtp`) are now those handlers, `getMe` becomes the rule
  `getCallerUser(caller)` that auth calls, and health's `healthHandler` and `readyHandler(list?)`
  become `getHealth` and `getReadiness(list?)`.
- `repository.ts` is now `service.ts`: the module's queries, private to its controller. The
  rules the old `service.ts` held move into `controller.ts`; `health` loses its `service.ts`
  (it has no data).
- `api/module/` shows the pattern: handlers hold the logic, `service.ts` names its queries
  after the entity (`findModuleById`, `listModules`, `createModule`, `updateModule`,
  `deleteModule`), and create publishes `module.created`, now an event in both variants.
- Password verification moves from the user module to auth; the user controller exports
  `findUserByEmail`, which returns the stored hash beside the public user.
- `schema.ts` exports `<operation>Request` objects, the request parts `validate()` checks in
  `routes.ts` and `readInput()` reads back in the controller.
- `config/routes.ts` exports `registerRoutes(app)`, one `app.use('/api/<name>', …)` per module;
  the OpenAPI registration list moves to `openapi.ts`.
- ESLint zones and `AGENTS.md` follow the new layering.
- `AGENTS.md` gains the agent-facing sections Adding a module, Adding the data layer, Errors and
  Tests, and the last harness-only remarks leave the base.

## 1.0.0 — 2026-10-22

Moved from fullstack-dev-harness `templates/backend` (plan 005 state); auth flag; lockfile committed.
