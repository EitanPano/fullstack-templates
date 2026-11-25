# Changelog

## 3.1.0 — 2026-11-25

### Added

- With an `sdk` package in the plan ([ADR 0020](../../docs/adr/0020-sdk-kind.md) N1 to N5; without one the generated package is unchanged):
  - the SDK namespace `api/sdk/`, mounted at `/api/sdk/v1`, an entity of it being `api/sdk/<entity>/`. `middleware/sdk_gate.py` runs first: CORS for the namespace alone (`SdkCorsMiddleware`: origin echoed when the key lists it, `Vary: Origin`, never credentials, `Access-Control-Max-Age: 600`), the `X-Sdk-Key` key resolved by `services/security/sdk_keys.py`, then the rate limit by address and by key (`sdkPerIp`, `sdkPerKey` in `RATE_LIMITS`; a preflight counts on the address limit). A request that sends `Sec-Fetch-Site` is same-origin only when it says `same-origin`; one that does not is same-origin with no `Origin`, or when the `Origin`'s host and port equal the raw `Host` header. A same-origin request needs a valid key only and gets no allow-origin header; `frame_only` refuses any other on an entity only the frame calls. Every answer of the namespace is `Cache-Control: no-store` with `Vary: Origin, X-Sdk-Key` and none carries `Access-Control-Allow-Credentials`. No cookie is read. The global `CORS_ORIGINS` layer skips every path under `/api/sdk/` (the namespace, the files, the frame); elsewhere it is as it was.
  - `GET /api/sdk/v1/config` answers `{ enabled }` from `SDK_ENABLED`; it is in `openapi.json` with the key header and the 403 and 429 answers.
  - `GET|HEAD /api/sdk/dist/v<major>/<file>.js` and `GET /api/sdk/frame/v<major>?k=<key>` (`middleware/sdk_files.py`), from `SDK_DIR`, outside the key gate and outside the OpenAPI document; both match the raw request path. The frame carries one `Content-Security-Policy` whose `frame-ancestors` are the key's origins (`'none'` for an unknown key), no `X-Frame-Options`, `Cache-Control: no-store`; the security-header middleware leaves the headers a response owns (`set_own_security_headers` in `middleware/context.py`). A script carries an `ETag` (a digest of its bytes), and a request that holds it gets 304.
  - `SDK_KEYS`, `SDK_ENABLED` and `SDK_DIR` in `config/env.py`: a malformed `SDK_KEYS` stops the boot naming the variable and never the key; each origin must be `scheme://host[:port]` in lower case, and in production `https` and not `localhost` or `127.*`.
  - the Dockerfile copies the SDK's build from the `sdk` build context and sets `SDK_DIR`; `compose.yaml` adds that context in both deploy modes (Compose 2.35.0 or later) and passes `SDK_KEYS` and `SDK_ENABLED`.
  - import-linter treats `api/sdk/<entity>/` as it treats `api/admin/<entity>/`.
  - the `sdk` case in `tests/cases.yaml`.

## 3.0.0 — 2026-11-24

### Changed (breaking)

- The architecture unit is an entity, not a module ([ADR 0018](../../docs/adr/0018-entity-term-and-service-facades.md) E1-E3): `api/<name>/` is "an entity", `api/admin/<name>/` an admin entity, the heading `Adding a module` is `Adding an entity`, and the import-linter contract names, comments, docstrings and tests say entity. Contract keys are unchanged.
- The sample is named `entity`. Directories `api/module/` → `api/entity/` and `models/module/` → `models/entity/`; test file `tests/test_module.py` → `tests/test_entity.py`; route `/api/module` → `/api/entity` (tag `module` → `entity`, error message `module not found` → `entity not found`); with Postgres, table `module` → `entity` and index `module_created_at_id_idx` → `entity_created_at_id_idx` (`0001-init.sql` edited in place).
- Identifiers, case kept: `ModuleRecord` → `EntityRecord`, `ModuleStatus` → `EntityStatus`, `ModuleLimits` → `EntityLimits`, `MODULE_LIMITS` → `ENTITY_LIMITS`, `PublicModule`, `CreateModuleInput`, `UpdateModuleInput` → `PublicEntity`, `CreateEntityInput`, `UpdateEntityInput`; schema `Module`, `ModulePage`, `CreateModuleBody`, `UpdateModuleBody` → `Entity`, `EntityPage`, `CreateEntityBody`, `UpdateEntityBody` (also the OpenAPI component names); `create_module`, `find_module_by_id`, `update_module`, `delete_module`, `get_module`, `list_module` / `list_modules` → `create_entity`, `find_entity_by_id`, `update_entity`, `delete_entity`, `get_entity`, `list_entity` / `list_entities`; `module_id` → `entity_id`, `module_router` → `entity_router`, `_ModuleRow` → `_EntityRow`; event `module.created` → `entity.created`, `MODULE_CREATED` → `ENTITY_CREATED`, `ModuleCreated` → `EntityCreated`; `MODULES` in `api/admin/routes.py` → `ENTITIES`.
- Migration for a project generated earlier: rename the directories, the test file and the identifiers above, or keep the old names (they are only a sample); with Postgres add a migration that renames the table and the index; regenerate `openapi.json` and the frontend's client.
- The role-change line in `AGENTS.md` names the role list in this package's `.doc/architecture.md` instead of "this file" ([ADR 0019](../../docs/adr/0019-package-docs.md)). A project generated earlier changes "the tests that use the role; this file." by hand.

## 2.2.0 — 2026-11-22

### Added

- The admin namespace ([ADR 0015](../../docs/adr/0015-several-frontends-by-directory.md) A1): `api/admin/routes.py` builds the router `config/routes.py` mounts at `/api/admin`, and an admin module is `api/admin/<name>/` at `/api/admin/<name>`, its router added to `MODULES` in that file. One gate is a dependency of the whole namespace, the same in every environment: with `auth`, `require_role(UserRole.admin)` (401 without a session, 403 for another role); without `auth`, every request is refused with 403 until the product writes its own gate. A fallback route under the gate answers an unknown admin path with the JSON 404 only once the gate admits the caller (`/api/admin` included). No admin module ships, the fallback is out of the schema, and `openapi.json` is unchanged.
- import-linter treats `api/admin/<name>/` as a module: the per-file contracts name `app.api.**.<file>` (admin modules included), `app.api.admin` stays one unit beside the entity modules in the independence contract (its modules reach an entity's controller and schema only; no entity module imports an admin one), and a second independence contract keeps the admin modules apart. `tests/test_admin.py` and `tests/test_boundaries.py` (which runs `lint-imports` on a copy with fixture modules) prove it.

## 2.1.0 — 2026-11-12

### Added

- A 401 for a request with no valid access token (`authentication required`) carries `WWW-Authenticate: Bearer`, built by `authentication_required()` in `services/utils/error.py`; wrong credentials, an invalid refresh token and an invalid code carry none, so a client can refresh on the header alone. The envelope is unchanged.

## 2.0.0 — 2026-11-12

### Changed (breaking)

- The sign-up endpoint is `POST /api/auth/signup`, not `/api/auth/register`; method, request, responses, status codes and rate limits are unchanged.
- Renamed: `register` → `signup` (controller), `register_limiter` → `signup_limiter`, `RATE_LIMITS.register_per_ip` → `signup_per_ip` (limiter name `registerPerIp` → `signupPerIp`), event `user.registered` → `user.signedup`, `USER_REGISTERED` → `USER_SIGNEDUP`, `UserRegistered` → `UserSignedUp`, `handle_user_registered` → `handle_user_signedup`. No environment variable changes.
- Migration for a project generated earlier: rename the route and the names above, or keep the old path; regenerate `openapi.json` and the frontend's client.

## 1.2.2 — 2026-11-07

### Fixed

- `single` mode caches a frontend's hashed build output immutable whatever its layout: `assets/*` (Vite), `media/*` and the root bundles `main-`, `polyfills-`, `chunk-`, `styles-` plus an eight-character hash (Angular). Every other file still revalidates.

## 1.2.1 — 2026-10-29

Documentation only.

- `AGENTS.md` keeps a `with_transaction` example in the text and stops pointing at the reference module once it is dropped (copy your first module instead).
- `AGENTS.md › Authentication` says what to update when a product renames the roles `user` and `admin`.

## 1.2.0 — 2026-10-26

- New command `start` (`uv run python -m app.main`): the server without a watcher or reloader, which a frontend's e2e starts.
- `RATE_LIMIT_SCALE` (a number from 1 to 1000, default 1, read once in `config/env.py`, listed in
  `.env.example`) multiplies every limit in `RATE_LIMITS`, rounded up; `rate_limit` applies it, with
  an optional `scale` argument for a caller that needs another. An e2e run raises it so a journey
  suite does not meet the limits; production keeps 1. There is no bypass switch. The same in the
  bun-express template.
- With the Postgres capability, a new command `e2eDb` (`uv run poe e2e-db`) prepares the e2e
  database that the provider's `e2e` URL names (`app_e2e`, overridden by `E2E_DATABASE_URL`). It
  creates the database when it is missing, applies the migrations and truncates every table except
  `schema_migration`, and refuses any database whose name does not end in `_e2e`. The script reads
  `E2E_DATABASE_URL` itself and sets `DATABASE_URL` before the first import that reads the
  environment.
- The Compose fragment writes the app secrets as `${NAME-}`, so `docker compose up -d --wait
  database` prints no "variable is not set" warning for them. An unset secret is still an empty
  string, and the server still refuses to boot in production without it.
- Test logs: pytest already captures what a test logs, so a green run prints no stack trace; the
  `AGENTS.md › Tests` section says so.

## 1.1.1 — 2026-10-25

- `by_ip` limits an IPv6 client by its /64, not its full address: a subscriber owns a whole /64, so
  rotating addresses inside it no longer dodges a per-IP limit. An IPv4 address is unchanged, an
  IPv4-mapped IPv6 address (`::ffff:203.0.113.5`) is its IPv4, and anything that is not an address
  is unchanged. `rate_limit_subject` in `middleware/rate_limit.py` does the mapping; the hashing and
  the cache key are as before. The same rule is in the bun-express template.
- `AGENTS.md`: on Windows, `dev --reload` leaves its child holding the port after the parent is
  stopped, and the port's owner then names the dead parent; the Commands note gives a PowerShell
  recipe that stops the owner and its children by port.

## 1.1.0 — 2026-10-24

- Static serving of a built single-page app, shipped in every project and inert unless `STATIC_DIR`
  is set (blank is unset; in production a directory without `index.html` stops the boot with
  `invalid environment: STATIC_DIR: <dir> has no index.html`). `src/app/middleware/static_files.py`
  serves it last in the router: files from the directory (`assets/*` immutable for a year,
  `index.html` `no-cache`), `index.html` for any extension-less path outside `/api`, and the 404
  envelope for a missing file with an extension, another method, a dotfile, an encoded traversal, a
  symlink out of the directory and a directory (never a listing). `/api` is decided on the
  once-decoded path, so `/%61pi/x` is not the shell. Every static response carries the security
  headers and the request id. The behaviour is the same as in the bun-express template, one test per
  row in each.
- The `Dockerfile` and the Compose fragment gain `single` deploy-mode lines (generated only when the
  frontend is built into the server's image): the SPA copied from the frontend's `dist` build
  context into `public/` for the `app` user, `STATIC_DIR=/app/public`, `TRUST_PROXY` defaulting to
  `false`, and the port published on every interface. The `split` shape is unchanged; the Compose
  comments are now per mode and no longer say the Next.js server is the only client.
- `AGENTS.md › Deployment` states both modes: the image and the lines each carries, `STATIC_DIR`,
  the behaviour table, ports, `TRUST_PROXY` per mode and in production, the Compose 2.35.0 floor for
  `single` and `docker compose --profile app down`.
- A file outside `assets/` (`/favicon.ico`, `/robots.txt`) is sent with `Cache-Control: no-cache`, the
  same as `index.html` and the nginx edge; it had been sent with none.
- Tests pin that a JSON route answers 400 `invalid body` for a body with no `Content-Type` or with
  `text/plain`, as bun-express does (FastAPI's `strict_content_type` default).
- `SpaMount` returns no match for a websocket scope, which `StaticFiles` cannot serve.
- `AGENTS.md › Deployment` lists the Compose and `Dockerfile` lines of both modes verbatim from `compose.yaml` and the `Dockerfile`, so a project generated in one mode can be moved to the other; a unit test keeps them equal to the files.

## 1.0.0 — 2026-10-23

- The `dev` command is `uv run python -m app.main --reload`, not `uv run poe dev`: poe starts its task in
  a new session on POSIX, so Playwright's process-group kill left the dev server running.
- The development and test database URLs default to `127.0.0.1`, not `localhost`: the Compose service
  publishes on IPv4 loopback only and Windows resolves `localhost` to `::1` first, which cost about
  2 s per connection.
- First version: FastAPI on Python 3.14, managed by uv (0.12.23 or later, below 0.14, which installs Python 3.14), at
  behavioural parity with `server/bun-express` 2.2.0. Same layer map (`config/`, `api/<module>/`,
  `models/`, `middleware/`, `services/`, `infra/`), same request flow, same endpoints, same error
  envelope and codes, a request id on every response, and health and readiness endpoints.
- The contract: pydantic models validate requests, type responses and produce `openapi.json`
  through FastAPI's generator, shaped to the document `server/bun-express` writes (no `422`, the
  named components only, inlined enums). The `contract` command is `uv run poe contract`.
- The reference module `api/module/` and `models/module/`, with cursor pagination, a rate limiter
  (`middleware/rate_limit.py`) and events; the in-process record store and key-value store
  (`infra/memory.py`), the in-process bus (`infra/pubsub.py`) and the APScheduler scheduler
  (`infra/scheduler.py`), all `Resource`s behind the `services/db.py`, `services/cache.py` and
  `services/event.py` seams.
- The `auth` flag (default on): accounts, sessions with refresh rotation and a reuse grace window,
  HS256 JWTs, one-time codes, cookies, role gates, the `session-cleanup` job and the welcome
  subscriber. Off removes the `auth` and `user` modules, their gates, models, jobs, subscribers and
  tests, and the `pyjwt` dependency; every endpoint is then public.
- The gates, as one command: `uv run poe check` runs ruff, import-linter (the layer contracts in
  `pyproject.toml`), the format check, mypy in strict mode and pytest, with `filterwarnings =
  ["error"]`. Tests drive the app in process with an `httpx.AsyncClient`, never Starlette's
  `TestClient`.
- The `database/postgres` capability. With `--capability database=postgres` the overlay replaces
  `services/db.py`, the module and user `service.py` files and `services/session.py` (with `auth`)
  with Postgres queries over psycopg 3 and its async pool; adds `infra/postgres.py` (a `Resource`,
  in `dependencies` beside `memory`, which stays the cache), `infra/migrations/0001-init.sql` and
  `infra/scripts/migrate.py` (an advisory lock, one transaction per file, `.sql` files shipped in
  the wheel), and `services/utils/postgres_error.py`, which the error handler uses to answer 503
  `upstream_unavailable` for a lost connection (no SQLSTATE) and 409 `conflict` for a unique
  violation. Session rotation is one conditional update, so one concurrent rotation wins. Adds
  `uv run poe migrate` and `uv run poe test-db` (a pytest plugin that points the run at
  `app_test`), a derived one-shot `backend-migrate` Compose service, pins on the base files the
  overlay shadows, and the cases `postgres`, `auth-off-postgres`, `stack-postgres` (built and
  smoke-tested in Compose) and `stack-auth-off-postgres`.
- `infra/jobs/` and `infra/subscribers/` exist in every variant (empty without `auth`), so the
  import-linter contract that keeps a job or a subscriber to a module's controller applies to a
  first job in a project without accounts.
- Every middleware is pure ASGI, in the order `security_headers`, `cors`, `request_id`, `proxy`,
  `request_log`, `body_limit`, `head` and a catch-all, which a test pins. HEAD is answered wherever
  GET is. An invalid `TRUST_PROXY` fails at startup. The client IP follows proxy-addr's algorithm,
  with a vector table in the tests.
- A two-stage Dockerfile on `python:3.14-slim` (uv copied from `ghcr.io/astral-sh/uv:0.13`, a
  non-root user, `python -m app.main` in exec form) and a `compose.yaml` fragment that publishes
  the port on loopback only.
- One event loop class everywhere: `infra/loop.py` gives the selector loop that uvicorn and the
  tests use.
- `AGENTS.md` carries the agent-facing sections the harness cites: Adding a module, Adding the
  data layer, Errors and Tests.
- Deviations from bun-express, each intentional: validation message text is pydantic's; a string
  length counts code points; a trailing slash is a 404; a compressed request body is a 415; no
  `ETag`; `APP_ENV` replaces `NODE_ENV`; the default port is 8000; a failed bind exits with
  uvicorn's code.
