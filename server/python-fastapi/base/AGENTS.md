# Backend

The layer map of `backend/`. What holds for the whole repository (versions, commands,
definition of done) is in the repository's root `AGENTS.md`; nothing here repeats it. This
file ships with the package; an agent working in this directory loads it, and a planner or
reviewer reads it explicitly.

This is a Python 3.14 package managed by uv. Files and modules are snake_case, the only form an
import name can take. A name never shadows the standard library (`enums.py`, not `enum.py`;
`services/utils/clock.py`, not `time.py`). Every directory under `src/app/` and `tests/` is a
package with an `__init__.py`.

## Packages and conventions

- FastAPI with pydantic v2, served by plain `uvicorn` (with `watchfiles` for reload). Nothing else
  is added without a plan: dependencies are edited by hand in `pyproject.toml`, then `uv lock`.
  There is no pydantic-settings and no `.env` loading: secrets never live in a file in the
  working tree.
<!-- @auth-start -->
- Security: `argon2-cffi` hashes passwords (argon2id, through `anyio.to_thread.run_sync`, never on
  the loop), `PyJWT` signs and verifies HS256 tokens, `cryptography` does AES-256-GCM; HMAC,
  SHA-256 and random tokens are the standard library. Every comparison of a secret-derived value
  (an OTP digest, a token hash) is `crypto.constant_time_equals`.
<!-- @auth-end -->
<!-- @noauth-start -->
- Security: `argon2-cffi` hashes passwords (argon2id, through `anyio.to_thread.run_sync`, never on
  the loop), `cryptography` does AES-256-GCM; HMAC, SHA-256 and random tokens are the standard
  library.
<!-- @noauth-end -->
- Commands are the harness's vocabulary, each with its poe task in this package: `install`
  (`uv sync`), `dev` (`uv run python -m app.main --reload`, run directly and not through poe,
  which starts tasks in a new session so a supervisor's process-group stop would not reach the
  server; `uv run poe dev` is the same for people), `check` (`uv run poe check`: lint, format
  check, type check, then tests, stopping at the first failure), `typecheck`
  (`uv run poe typecheck`), `lint` (`uv run poe lint`: ruff, then import-linter), `format`
  (`uv run poe format`), `test` (`uv run poe test`) and `contract` (`uv run poe contract`).
  `check` never needs Docker.
  - On Windows the `--reload` parent leaves its child holding the port after the parent is
    stopped, and the port's `OwningProcess` then names the dead parent, so killing that id
    finds nothing. Stop the owner and its children in Windows PowerShell (replace 8000 with
    the server's `PORT`), then check the port is free before starting again:

    ```powershell
    $o = (Get-NetTCPConnection -LocalPort 8000 -State Listen).OwningProcess | Select-Object -Unique; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in $o -or $_.ParentProcessId -in $o } | ForEach-Object { Stop-Process -Id $_.ProcessId }
    ```
<!-- @database:postgres-start -->
- With the database, three more: `migrate` (`uv run poe migrate`) applies the SQL migrations,
  `testDb` (`uv run poe test-db`) runs the whole suite against the test database, and `e2eDb`
  (`uv run poe e2e-db`) prepares the e2e database for a browser suite; `check` skips the
  store-backed suites that `testDb` runs (see Adding the data layer).
<!-- @database:postgres-end -->
- Types are strict: `mypy` runs in strict mode with the pydantic plugin and `disallow_any_explicit`,
  so there is no `Any`; use `object`, `JsonValue` or a narrower type. A `# type: ignore[code]`
  carries its reason on the same line. `ruff` selects `E F W I B UP A N ASYNC S DTZ RUF SIM PT ANN`
  at line length 100. Named imports, small files with one responsibility, comments say why.
- Logging goes through `services/logger.py` (`log.info`, `log.warning`, `log.error`; one line, then
  `key=value` fields; a field whose key looks secret prints `[redacted]`). It configures the root
  logger, so uvicorn's records come out in the same format. One line per request comes from
  `middleware/request_log.py` (method, raw path without the query string, status, duration, request
  id), and every unexpected error is logged once with its stack by `middleware/error_handler.py`.
  Nothing else calls `print` or `logging`, except the development console provider
  (`services/communicate/console.py`), which prints a message on purpose to bypass the logger. No
  logging library until the product needs one; the logger is the seam where it would go.
- Time: every expiry and window reads wall time through `services/utils/clock.py` (`now()`), never
  `time.monotonic()`, which `time-machine` does not move. Durations are `'15m'` strings parsed by
  `parse_duration`; a timestamp on the wire is `to_iso`.
<!-- @nodatabase-start -->
- Persistence: the template's only store is `infra/memory.py` (records and key-values in process
  memory, a `Resource`). Every infrastructure dependency is a `Resource` from
  `infra/dependency.py`, listed in `dependencies` in that file: connected at boot with bounded
  retry, pinged by `GET /api/health/ready`, closed in reverse on shutdown. Reconnecting after a
  drop is the driver's job. This template lists `memory`, `pubsub` and `scheduler`, in that order.
  The data-layer task adds the chosen engine beside `memory` (see Adding the data layer).
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
- Persistence: records live in Postgres, through psycopg 3 (`psycopg[binary,pool]`, async, with its
  connection pool). `infra/postgres.py` is its `Resource`, beside `infra/memory.py`, which is now
  the cache (`services/cache.py`) until the cache task moves it to its own store. Every
  infrastructure dependency is a `Resource` from `infra/dependency.py`, listed in `dependencies`
  in that file: connected at boot with bounded retry, pinged by `GET /api/health/ready`, closed in
  reverse on shutdown. This template lists `memory`, `postgres`, `pubsub` and `scheduler`, in that
  order. Reconnecting after a drop is the pool's job (it replaces a connection that fails its
  check) and nothing connects at import: the pool is built on first use, behind a lock. The schema
  is SQL migrations (see Adding the data layer).
<!-- @database:postgres-end -->
- One event loop class everywhere: `infra/loop.py` gives `selector_loop_factory`, which uvicorn
  and the tests' `anyio_backend` fixture use. Never run a database driver on Windows' default
  Proactor loop.

## Layer map

```
src/app/
  main.py             `app.main:app` with the infra lifespan; runs uvicorn; imported by nothing
  server.py           `create_app()` and `app`; builds the app, never listens, attaches no infra
  openapi.py          builds, shapes and caches the contract; `--write` emits openapi.json
  config/             env.py · constants.py · cors.py · routes.py
  api/<name>/         routes · controller · schema; service only when the module has data
                      (model.py: reserved, for an engine that defines storage in code)
<!-- @auth-start -->
                      (health, auth, user, module: the commented reference)
  models/<name>/      interface · type · enums · constants (auth, session, user, module)
  middleware/         request_id · request_log · security_headers · cors · proxy · body_limit ·
                      error_handler · not_found · head · static_files · context
                      asgi (helpers the ASGI middleware share)
                      rate_limit · auth · role (the gates)
  services/           logger.py · db.py · cache.py · session.py · event.py
    security/         crypto · jwt · cookies · otp
<!-- @auth-end -->
<!-- @noauth-start -->
                      (health, module: the commented reference)
  models/<name>/      interface · type · enums · constants (module)
  middleware/         request_id · request_log · security_headers · cors · proxy · body_limit ·
                      error_handler · not_found · head · static_files · context
                      asgi (helpers the ASGI middleware share)
                      rate_limit (the gate)
  services/           logger.py · db.py · cache.py · event.py
    security/         crypto
<!-- @noauth-end -->
    communicate/      __init__.py · console · mail · sms · whatsapp · templates/ <!-- @auth -->
    communicate/      __init__.py · console · mail · sms · whatsapp (templates/ arrives with the first message) <!-- @noauth -->
    utils/            error · openapi · clock · api_model · pagination (pure, no I/O) <!-- @nodatabase -->
    utils/            error · openapi · clock · api_model · pagination · postgres_error (pure, no I/O) <!-- @database:postgres -->
  infra/              dependency.py · loop.py · memory.py · pubsub.py · scheduler.py <!-- @nodatabase -->
  infra/              dependency.py · loop.py · memory.py · postgres.py · pubsub.py · scheduler.py <!-- @database:postgres -->
    jobs/             one file per background job: session_cleanup <!-- @auth -->
    subscribers/      one file per event reaction: send_welcome <!-- @auth -->
    jobs/             one file per background job (an empty package until the first one) <!-- @noauth -->
    subscribers/      one file per event reaction (an empty package until the first one) <!-- @noauth -->
    migrations/       NNNN-<topic>.sql, the schema, applied in name order <!-- @database:postgres -->
    scripts/          one-off commands: migrate.py (poe migrate), e2e_db.py (poe e2e-db); seed is reserved <!-- @database:postgres -->
                      (scripts/ arrives with the data layer) <!-- @nodatabase -->
tests/                mirrors src/app/ (a package throughout, so two test_x.py cannot clash)
openapi.json          the committed contract, written by the `contract` command
```

- `main.py` is the process entry and the only file that listens. It reads `config/env.py`, builds
  the lifespan that warns once per defaulted secret and connects `dependencies`
  (`infra/dependency.py`), and runs uvicorn on the selector loop. uvicorn owns signals and the
  drain; the lifespan disconnects every resource in reverse order (10 s cap on the drain).
- `server.py` builds and exports `app` through `create_app()`, nothing else: the middleware, the
  exception handlers, then `register_routes(app)` from `config/routes.py`, which mounts every
  module under `/api`. Tests import `app` and never start infra.
- `openapi.py` builds the OpenAPI document from the mounted routers (FastAPI derives the paths),
  shapes it to the contract the frontend consumes, and caches it. `COMPONENTS` lists the models
  that are contract components. The `contract` command writes `openapi.json`.
- `config/`: `env.py` is the only reader of the process environment (a pydantic model through
  `load_env`; it fails fast and exports `env` and `defaulted_secrets`).
<!-- @auth-start -->
  Production requires the secrets, elsewhere they default. `constants.py` holds policy: durations,
  attempts, rate-limit windows (`RATE_LIMITS`), `COOKIE_NAMES` and `COOKIE_PATHS`,
  `BEARER_PREFIX`.
<!-- @auth-end -->
<!-- @noauth-start -->
  Production requires `ENCRYPTION_KEY`, elsewhere it defaults. `constants.py` holds policy:
  durations, attempts, rate-limit windows (`RATE_LIMITS`).
<!-- @noauth-end -->
  `cors.py` builds the CORS options. `routes.py` is the mount table: `register_routes(app)`, one
  `app.include_router(<name>_router, prefix="/api/<name>")` line per module.
- `api/<name>/`: one directory per module, singular name, mounted at `/api/<name>`. A module
<!-- @auth-start -->
  is a resource (`user`) or a capability (`auth`, `health`). A module has the files it needs:
  `service.py` only with data of its own (`health` and `auth` have none).
<!-- @auth-end -->
<!-- @noauth-start -->
  is a resource or a capability (`health`). A module has the files it needs: `service.py` only
  with data of its own (`health` has none).
<!-- @noauth-end -->
  - `schema.py`: pydantic request and response models and the path and query parameter types
    (`ModuleId`, `PageQuery`). Each model derives from `RequestModel`, `QueryModel` or
    `ResponseModel` (`services/utils/api_model.py`). The leaf of the module.
  - `routes.py`: the module's `router: APIRouter`. The gates (a rate limiter, and with accounts
    the authentication and role gates) are built once as named constants above the table, then
    each endpoint is one `router.add_api_route(path, handler, ...)` naming the handler, the
    status and response model, the error responses (`error_responses(...)`), the summary and the
    gates as `dependencies=[Depends(...)]`. No inline handlers, no logic.
  - `controller.py`: the module's business logic and its only door. Two kinds of export:
    - Handlers: one `async` function per endpoint, named after its operation with no suffix
      (`create_module`, `get_module`), holding that endpoint's logic. FastAPI validates its
      parameters from the signature; it applies the rules (raising `AppError`), reads and writes
      through its own `service.py`, maps records to response models, publishes events, calls
      providers, owns transactions when the engine has them, and returns the response model (or a
      bare `Response` for a 204). `api/module/` is the example.
<!-- @auth-start -->
      Auth handlers also set or clear cookies: cookies are transport, so they belong to the
      handler, which declares a `response: Response` parameter.
<!-- @auth-end -->
    - Rules: logic another module's controller, a job, a subscriber or a script needs is
      exported as a typed function with no request, no response and no status code; a handler
      that needs the same logic calls it. A module exports none until something outside it
<!-- @auth-start -->
      needs one: `api/user/` exports the ones auth and the welcome subscriber call
      (`get_caller_user(caller)`, `get_active_user(user_id)`, `find_user_by_email(email)`, ...).
      A rule never takes a handler's name, since both are exports of one file: `get_me` is the
      handler, `get_caller_user` the rule it shares with auth.
<!-- @auth-end -->
<!-- @noauth-start -->
      needs one. A rule never takes a handler's name, since both are exports of one file.
<!-- @noauth-end -->
  - `service.py` (and `model.py`): every query for the module and nothing else, private to it:
    only its own controller imports it. The only module files that import `services/db.py` or
    `services/cache.py`.
- `models/<name>/`: an entity's types, shared by every layer, and importing nothing but other
  `models/`, not even pydantic. `interface.py` the stored record (a frozen dataclass), `type.py`
  the public shape, the create and update inputs and derived types, `enums.py` closed value sets
  (`StrEnum`), `constants.py` limits of the data itself. A directory has the files it needs. The
  wire shape is the pydantic model in `schema.py`; the controller maps between the two. `models/`
  (plural, types) and `model.py` (singular, in a module, the engine's storage mapping) are
  different things.
<!-- @auth-start -->
  A capability module whose types other layers share still gets a `models/` directory:
  `models/auth/` holds `Caller`, `AuthTokens` and `OtpPurpose`.
<!-- @auth-end -->
<!-- @noauth-start -->
  A capability module whose types other layers share still gets a `models/` directory.
<!-- @noauth-end -->
<!-- @auth-start -->
- `middleware/`: request handling an endpoint or every request needs. The ASGI middleware
  (`request_id`, `request_log`, `security_headers`, `cors`, `proxy`, `body_limit`, `head`, the
  catch-all in `error_handler`) wrap every request; `context.py` holds the typed accessors for
  what they store in the request scope. The gates are FastAPI dependencies: `auth.py` resolves
  the caller, `role.py` gates by role, `rate_limit.py` limits (the key holds a hash of the
  subject). `static_files.py` serves a built SPA when `STATIC_DIR` is set (see Deployment).
<!-- @auth-end -->
<!-- @noauth-start -->
- `middleware/`: request handling an endpoint or every request needs. The ASGI middleware
  (`request_id`, `request_log`, `security_headers`, `cors`, `proxy`, `body_limit`, `head`, the
  catch-all in `error_handler`) wrap every request; `context.py` holds the typed accessors for
  what they store in the request scope. `rate_limit.py` is the gate, a FastAPI dependency (the
  key holds a hash of the subject). `static_files.py` serves a built SPA when `STATIC_DIR` is set
  (see Deployment).
<!-- @noauth-end -->
<!-- @auth-start -->
- `services/`: stateful or I/O capabilities shared by modules: the stores' seams (`db.py`,
  `cache.py`), events, logging, sessions, `security/` (tokens, cookies, hashing, OTP),
  `communicate/` (channels, providers, message templates), and `utils/` (pure, stateless, no
  I/O).
<!-- @auth-end -->
<!-- @noauth-start -->
- `services/`: stateful or I/O capabilities shared by modules: the stores' seams (`db.py`,
  `cache.py`), events, logging, `security/` (hashing, encryption), `communicate/` (channels,
  providers), and `utils/` (pure, stateless, no I/O).
<!-- @noauth-end -->
- `infra/`: live connections and what runs on them. `dependency.py` holds `Resource`, the
<!-- @nodatabase-start -->
  `dependencies` list in connection order (`memory`, `pubsub`, `scheduler`), `connect_all`,
  `disconnect_all`, `health_check`, `with_retry` and `resource_lifespan`. `loop.py` is the
  selector loop factory. `scheduler.py` (APScheduler) runs the jobs listed in its `_jobs()`;
  `pubsub.py` is the in-process bus and registers the subscribers listed in its `_subscribers()`.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
  `dependencies` list in connection order (`memory`, `postgres`, `pubsub`, `scheduler`),
  `connect_all`, `disconnect_all`, `health_check`, `with_retry` and `resource_lifespan`.
  `postgres.py` is the Postgres store (a psycopg pool built on first use; `close` forgets it).
  `memory.py` holds no records now: it is the key-value store behind `services/cache.py` (and the
  rate limits). `loop.py` is the selector loop factory. `scheduler.py` (APScheduler) runs the jobs
  listed in its `_jobs()`; `pubsub.py` is the in-process bus and registers the subscribers listed
  in its `_subscribers()`. `migrations/` holds the SQL files and `scripts/` the one-off commands,
  `migrate.py` among them.
<!-- @database:postgres-end -->
<!-- @auth-start -->
  `jobs/` holds one file per job, `subscribers/` one file per event reaction.
<!-- @auth-end -->
<!-- @noauth-start -->
  `jobs/` and `subscribers/` are empty packages until the first job or reaction is added.
<!-- @noauth-end -->
  `scripts/` is created with the data layer. <!-- @nodatabase -->

## Where does X go

| You are adding... | It goes in | Shape |
| --- | --- | --- |
| A resource or capability with endpoints | `api/<name>/` | copy `api/module/`, rename `module`, `Module`, `MODULE`; one line in `config/routes.py` and the component names in `COMPONENTS` in `openapi.py` |
| An entity's types | `models/<name>/` | copy `models/module/` |
| A limit on an entity's field | `models/<name>/constants.py` | lengths, ranges, defaults of the data |
| A policy constant | `config/constants.py` | durations, attempts, windows, cookie and header names | <!-- @auth -->
| A policy constant | `config/constants.py` | durations, attempts, windows | <!-- @noauth -->
| A request or response shape | `api/<name>/schema.py` | a `RequestModel`, `QueryModel` or `ResponseModel`; a contract component only when named in `COMPONENTS` |
| An endpoint | `api/<name>/routes.py` + `controller.py` | one `router.add_api_route(...)`; one handler named after the operation (`create_module`); its input types in `schema.py` |
| A business rule, an event to publish, a call to another service | `api/<name>/controller.py` | in the endpoint's handler; an exported rule once something outside the module needs it; raises `AppError` |
| A rule composing other modules | `api/<name>/controller.py` | `api/auth/` is the example | <!-- @auth -->
| A rule composing other modules | `api/<name>/controller.py` | calls each module's `controller.py` | <!-- @noauth -->
| A query | `api/<name>/service.py` | `get_db()` from `services/db.py`, `services/cache.py`; private to the module | <!-- @nodatabase -->
| A query | `api/<name>/service.py` | SQL through `fetch_one`, `fetch_all` and `execute` from `services/db.py`; an optional last `db` keyword; private to the module | <!-- @database:postgres -->
| A change to the tables or indexes | `infra/migrations/NNNN-<topic>.sql` | the next number, never an edit to an applied file; then `uv run poe migrate`; update the module's `service.py` and its row mapping | <!-- @database:postgres -->
| Something another module needs | `api/<name>/controller.py` | an exported rule; the only cross-module import |
| Shared behaviour with state or I/O | `services/<name>.py` | sessions, cache, events, logging | <!-- @auth -->
| Shared behaviour with state or I/O | `services/<name>.py` | cache, events, logging | <!-- @noauth -->
| A vendor SDK wrapper | `services/<vendor>.py` | thin; key from `config/env.py`; the SDK is imported only here |
| A pure helper | `services/utils/<name>.py` | no I/O, no state |
| A security primitive | `services/security/<name>.py` | hashing, tokens, cookies, OTP | <!-- @auth -->
| A security primitive | `services/security/<name>.py` | hashing, encryption, tokens | <!-- @noauth -->
| A way to reach a person | `services/communicate/<channel>.py` | `Provider` protocol, console provider, env selection |
| A real provider for a channel | `services/<vendor>.py` + a `case` in the channel file | `MAIL_PROVIDER=<vendor>` selects it |
| A message's wording | `services/communicate/templates/<name>.py` | pure function returning a `Rendered` |
| A gate an endpoint needs | `middleware/<name>.py` | a dependency in the route's `dependencies=[Depends(...)]` |
| Handling every request needs | `middleware/<name>.py` | pure ASGI middleware, added in `server.py`; never `BaseHTTPMiddleware` |
| A live connection (database, cache, queue) | `infra/<store>.py` | a `Resource` in `dependencies`; reached through `services/db.py`, `cache.py`, `event.py` |
| A background job | `infra/jobs/<name>.py` | `Job(name, schedule, run)`; listed in `_jobs()` in `infra/scheduler.py` |
| An event | `services/event.py` | a `Topic` constant with its payload type; `publish` from a controller; handlers run detached, tests await `drain()` |
| A reaction to an event | `infra/subscribers/<name>.py` | `subscriber(TOPIC, handle)`; listed in `_subscribers()` in `infra/pubsub.py` |
| A one-off command (migrate, seed) | `infra/scripts/<name>.py` | `uv run python -m app.infra.scripts.<name>`; may call controllers' rules | <!-- @nodatabase -->
| A one-off command (seed) | `infra/scripts/<name>.py` | `uv run python -m app.infra.scripts.<name>`; may call controllers' rules; `migrate.py` is the shipped one | <!-- @database:postgres -->
| An environment variable | `config/env.py` + `.env.example` | required in production, defaulted elsewhere |
| An allowed browser origin | `config/cors.py` | set `CORS_ORIGINS`, only when a browser calls the API directly |
<!-- @noauth-start -->

`services/communicate/templates/` does not exist in this variant yet: create it with an
`__init__.py` when the first message template goes in. `infra/jobs/` and `infra/subscribers/` are
empty packages until a job or a reaction is added.
`infra/scripts/` arrives with the data layer; create it with an `__init__.py`. <!-- @nodatabase -->
<!-- @noauth-end -->

## Request flow

`config/routes.py → api/<name>/routes.py → gates → controller.py (handler, and any rule it
shares) → service.py → services/db.py → infra/<store>.py`. A `routes.py` holds nothing but the
gates and the handler per endpoint. The gates are FastAPI dependencies in declaration order; they
run before the body's validation errors are raised, so a gate refuses a malformed request first.
Validation comes from the handler's signature: FastAPI validates, and
`middleware/error_handler.py` shapes the failure into the 400 envelope. A handler holds its
endpoint's logic; it reaches its own data only through its `service.py` and other modules only
through their `controller.py` rules.

The middleware are pure ASGI, never `BaseHTTPMiddleware`. `server.py` adds them inner first, so the
order outer to inner is: security headers, CORS (only when `CORS_ORIGINS` is set), request id,
proxy (the client IP), request log, body limit, head, the catch-all. `head` runs a HEAD request as
GET and drops the body, so HEAD is answered wherever GET is. No middleware raises: one that refuses
a request sends the error envelope itself. The built SPA is not middleware: `server.py` mounts it
last in the router when `STATIC_DIR` is set, so the order above does not change.

## Import direction

`import-linter` enforces the import direction. `lint` runs it and the contracts are in
`pyproject.toml`, under `[tool.importlinter]`. A new file is checked by the contracts whose
patterns match its path; a contract that lists its sources names them, so a new store, scheduler
or infra file joins the list.

| Contract | What it enforces |
| --- | --- |
| `layers: entry, server, routes, modules, middleware, services, config` | the overall direction: `main`, `server`, `config/routes`, `api`, `middleware`, `services`, `config/cors`, then the `config` leaves; a lower layer never imports a higher one |
| `models import models only` | `models/` imports nothing else of the app |
| `config constants and env import nothing from the app` | `config/constants.py` and `config/env.py` are leaves |
| `config constants does not import env` | `constants.py` never imports `env.py` |
| `config env does not import constants` | `env.py` never imports `constants.py` |
| `config cors imports config env only` | `cors.py` imports `config/env.py` and nothing else of the app |
| `services utils is pure` | `services/utils/` imports no `api`, `middleware`, `infra`, `logger`, `server`, `main`, `openapi`, `config/cors` or `config/routes` |
| `config routes imports module routes only` | `config/routes.py` imports each module's `routes.py` and no other module file |
| `only config routes imports a module routes` | nothing but `config/routes.py` imports a `routes.py` |
| `only server imports the mount table` | nothing but `server.py` imports `config/routes.py` |
| `config and services utils do not import infra` | `config/` and `services/utils/` never import `infra/` |
| `services never import middleware, api, server or entry` | `services/` is below the HTTP layer |
| `services reach infra through dependency, the seams reach their store` | `services/` imports `infra/dependency.py`; `db.py` and `cache.py` import `infra/memory.py` (later the engine), `event.py` imports `infra/pubsub.py`; no other infra file | <!-- @nodatabase -->
| `services reach infra through dependency, the seams reach their store` | `services/` imports `infra/dependency.py`; `db.py` imports `infra/postgres.py`, `cache.py` imports `infra/memory.py`, `event.py` imports `infra/pubsub.py`; no other infra file | <!-- @database:postgres -->
| `db and cache seams import their store, logger, utils, config and models only` | the two seams import no bus, scheduler, other service or HTTP layer |
| `event seam imports the bus, logger, utils, config and models only` | `services/event.py` likewise |
| `only a module service and services use the db seam` | a module's `routes`, `controller` and `schema`, `middleware/`, `server`, `main` and `openapi` never import `services/db.py` |
| `only a module service, services and middleware rate_limit use the cache seam` | the same files never import `services/cache.py`, except `middleware/rate_limit.py` |
| `a routes, service or model never publishes events: a controller does` | none of them imports `services/event.py` |
| `middleware never imports api, infra, server or entry` | `middleware/` is below the modules |
| `infra never imports middleware, server or entry` | `infra/` is below the HTTP layer |
| `infra stores, bus, scheduler, dependency and loop import no api` | `dependency.py`, `loop.py`, the stores, the bus and the scheduler import no module |
| `infra files import logger, db, cache, event and utils only` | the same files import no other service |
| `jobs and subscribers reach a module through its controller only` | `infra/jobs/` and `infra/subscribers/` import a module's `controller` and `schema`, never its `routes`, `service` or `model`; the two packages exist in every variant (empty without `auth`), so a first job is linted from the start |
| `schema is the leaf of a module` | `schema.py` imports `models/`, `services/utils/` and `config/constants.py`, and a schema of another module |
| `routes wire gates to handlers` | `routes.py` imports its own `controller` and `schema`, `middleware/`, `models/`, `services/utils/` and `config/constants.py`; never `service`, `model`, any `services/` module but `utils/`, `infra/` or `config/env.py` |
| `controller holds the rules and the handlers` | `controller.py` never imports a `routes`, a `model`, `infra/` (except `infra/dependency.py`) or `config/routes.py` |
| `service is the data layer at the bottom of a module` | `service.py` and `model.py` import `services/db.py`, `services/cache.py`, `services/logger.py`, `services/utils/`, `models/` and `config/constants.py` only |
| `the data layer never sees HTTP` | `service.py` and `model.py` never import `fastapi` or `starlette` |
| `modules are independent: a controller and a schema are a module's only doors` | module privacy: a module's `service` is imported only from inside its own module; another module's `controller` and `schema` are the only allowed crossings (a controller imports a controller and a schema, a schema a schema) |
| `server mounts config routes and imports no api or infra` | `server.py` imports no `api`, `infra`, `models`, `services/utils/` or `main` |
| `openapi imports no module behaviour, infra or middleware` | `openapi.py` imports no `routes`, `controller`, `service`, `infra`, `middleware` or `main` |
| `main imports config env, infra dependency, logger and server only` | `main.py` stays an entry |
| `nothing imports the entry` | nothing imports `main.py` |
| `only the entry imports the server (openapi does, to write the contract)` | only `main.py`, tests and `openapi.py` import `server.py` |

Module privacy is one point stricter than a type-aware linter: import-linter cannot tell a
type-only import, so a module's `routes`, `service` and `model` never import another module's
`schema`, even for a type.

What import-linter cannot express stays a review rule:

<!-- @auth-start -->
- A rule forwards the caller it received, and a rule that takes a caller acts only on that
  caller's own data.
<!-- @auth-end -->
- Another module, a job, a subscriber or a script calls a controller's exported rules, never its
  handlers.
- A `routes.py` holds nothing but the gates and the handler per endpoint: no logic.
- A vendor SDK package is imported only by its own `services/<vendor>.py`.
- A cross-module flow is not atomic: each rule call is its own unit of work; a flow that must be
  atomic lives in one module.
- A controller publishes an event, after its write. Lint refuses a `routes`, `service` or `model`
  that publishes; a gate, a `services/` file or a job that does is a review finding.
- A script in `infra/scripts/` reaches a module only through its `controller` and `schema`; no
  contract checks it.

<!-- @auth-start -->
## Authentication

The template ships working auth (`api/auth/`, `api/user/`); a product starts from it. The client,
token, OTP and verification model is recorded in the project's architecture record (Auth) and
changes only by plan.

- Where rules live. Every module's rules live in its `controller.py`. A capability module whose
  rules only compose other modules and services has no `service.py`, and its controller holds the
  composition; `api/auth/` is the shipped example. Rules about user data (a blocked account, a
  phone already in use) stay in the user controller; credential rules (verifying a password, what
  a blocked account learns, and when) are auth's.
- Tokens: a short-lived access JWT and a refresh JWT, HS256, signed with separate secrets
  (`services/security/jwt.py`; `verify_access` and `verify_refresh` return `None` for anything
  invalid and judge expiry against `services/utils/clock.py`). The access token is stateless: a
  revoked session's access token lives until it expires.
- Sessions: `services/session.py` keeps one record per refresh session and rotates the refresh
  token on every use. The token just rotated away is answered, inside the grace window, with the
  token the winning rotation issued; any other hash is a replay and revokes every session of the
  user. The record has an absolute lifetime.
- The password hash. Every rule the user controller exports returns the public shape, except
  `find_user_by_email`, which hands auth the stored hash beside the user (never inside it) for
  auth to verify. Auth never returns or logs it.
- Authorization. `require_auth` and `require_role` in `routes.py` are declarative and fail fast;
  the handler checks the role again, so an endpoint mounted without its gate fails closed. A rule
  that takes a caller acts only on that caller's own account (`get_caller_user`), so a cross-module
  call cannot reach further than the route would. Operations only other modules, jobs or scripts
  call take no caller and are named system operations: `create_user`, `find_user_by_email`,
  `find_user_by_target`, `get_active_user`, `mark_verified`, `set_user_role`. There is no admin
  bootstrap: a seed script calls `set_user_role`.
- Gates: `middleware/auth.py` (`authenticate` never rejects, `require_auth` answers 401,
  `require_caller` gives a handler the caller) and `middleware/role.py` (`require_role`) are
  dependencies in a route's `dependencies=[...]`; they read the token only through
  `services/security/cookies.py`.
- Cookies and headers: only a controller or a gate touches `services/security/cookies.py`; a
  handler that sets cookies declares a `response: Response` parameter and no `Header` or `Cookie`
  parameter.
- One-time codes: `services/security/otp.py` keeps an HMAC digest in the cache and counts attempts
  with `incr` before it compares; it logs nothing. Delivery is `services/communicate/`, whose
  templates are pure wording.
- Secrets: the JWT and OTP secrets are at least 32 characters, the two JWT secrets differ, and
  production refuses a placeholder (`config/env.py`).
- Endpoints (`api/auth/`, `api/user/`): `POST /api/auth/{register,login,refresh,logout,otp,otp/verification}`
  and `GET|PATCH /api/user/me`, `GET /api/user` and `GET /api/user/{id}` (admin). Register, login,
  refresh and the login-purpose OTP verification set the cookies and `Cache-Control: no-store`;
  every credential failure is the same 401 and costs one password verification (`DUMMY_HASH` for
  an unknown email); a login code is delivered detached from its request, so the 202 is the same
  for every target.
- Background: `infra/jobs/session_cleanup.py` purges dead sessions hourly;
  `infra/subscribers/send_welcome.py` mails a new account on `user.registered`, published by the
  user controller's `create_user`.
<!-- @auth-end -->
<!-- @noauth-start -->
## Authentication

This scaffold was generated with the `auth` flag off (recorded as Auth: none in the project's
architecture record): every endpoint is public and no module takes a caller. Adding authentication
later is a planned change, not a patch to one module.
<!-- @noauth-end -->

## The engine seam

`services/db.py` and `services/cache.py` are file seams, not type seams: each exports the active
store, and the type changes with the engine. Today:

<!-- @nodatabase-start -->
- `services/db.py` exports `get_db()`, the record store (`collection(name, RecordType)` with `get`,
  `put` (an upsert), `delete` and `find`), and the `Collection` and `RecordStore` types. Call
  `get_db()` inside the function that queries, never at file scope.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
- `services/db.py` exports `get_db(db=None)`, an async context manager that hands out a connection
  from the pool in `infra/postgres.py` for the block (or gives back the `Executor` it was passed);
  `Executor`, the psycopg async connection, which is also what a `connection.transaction()` block
  holds; and three helpers that each run one parameterised statement: `fetch_one(RowType, query,
  params, db=)`, `fetch_all(...)` and `execute(...)` (rows changed). A row type is a dataclass over
  the selected columns. Call `get_db()` inside the function that queries, never at file scope: the
  pool is built on first use and replaced after a close.
<!-- @database:postgres-end -->
- `services/cache.py` exports the JSON helpers over the key-value store: `get(key, TypeAdapter)`,
  `set_value(key, value, ttl_ms)`, `delete` and `incr(key, ttl_ms)`. A value that fails its
  `TypeAdapter` is a miss.
- `services/event.py` exports the typed bus: `publish`, `subscribe`, `drain` and the `Topic`
  constants.

<!-- @nodatabase-start -->
The data-layer task rewrites `db.py` and every module's `service.py`, <!-- @noauth -->
The data-layer task rewrites `db.py`, every module's `service.py` and `services/session.py`, <!-- @auth -->
adds `infra/<engine>.py` and `infra/scripts/migrate.py`, and adds the engine resource to
`dependencies`; `memory` leaves it only when the cache task has moved `services/cache.py` to its
own store. The cache task rewrites `cache.py`, adds `infra/redis.py` and gives `infra/pubsub.py`
its adapter (see Adding the data layer). Until then nothing survives a restart.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
Only a module's `service.py` (and `model.py`) and the files of `services/` and `infra/` import
`services/db.py`; import-linter refuses it in `routes.py`, `controller.py` and `schema.py`. Every
query function in a module's `service.py` takes an optional last keyword, `db: Executor | None =
None`. Without it the query takes its own connection from the pool and commits when it is done;
with it the query runs on the connection given, in whatever transaction that connection is in. A
controller cannot import `services/db.py`, so a module that must write two things together exports
`with_transaction(work)` from its `service.py` (`api/module/service.py` is the example): the
controller opens it and passes the connection it receives to each query as `db=`. A service
function never opens a transaction, and a transaction never spans modules.

A statement is a literal with `%s` placeholders and its values travel as parameters, never inside
the text; a table or column name that is not fixed is built with `psycopg.sql.Identifier`, never
formatted in. A database driver runs on the selector loop (`infra/loop.py`): psycopg refuses
Windows' default Proactor loop, and the pool belongs to the loop that opened it.

`services/cache.py` is still on `infra/memory.py`. The cache task rewrites `cache.py`, adds
`infra/redis.py` and gives `infra/pubsub.py` its adapter (see Adding the data layer). Until then
the cache, the rate limits and the bus do not survive a restart or span replicas; the records do.
<!-- @database:postgres-end -->

The layer map is language-neutral on purpose: the bun-express template mirrors the same
directories and rules.

## Adding a module

Work in this order, test first.

1. Types in `models/<name>/` (`interface` the stored record, `type` the public shape and inputs,
   `enums`, `constants`). A record is a frozen dataclass; models import no pydantic.
2. `schema.py`: pydantic models. A request body derives from `RequestModel`, a query from
   `QueryModel`, a response from `ResponseModel`. A list's page is a concrete subclass of
   `Page[T]` (`class ModulePage(Page[Module])`) and its query is `PageQuery`.
3. `tests/test_<name>.py` (see Tests), red.
<!-- @nodatabase-start -->
4. `service.py`, only when the module has data: queries through `get_db()`, one collection per
   entity (`find_module_by_id`, `list_modules`), and a cursor model for `decode_cursor` when the
   list pages.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
4. `service.py`, only when the module has data: SQL through the helpers of `services/db.py`, one
   row dataclass and one `_to_record` mapping per entity, an optional last `db` keyword on every
   query (`find_module_by_id`, `list_modules`), and a cursor model for `decode_cursor` when the
   list pages. The table and its indexes ship in a migration (see Adding the data layer).
<!-- @database:postgres-end -->
5. `controller.py`: one handler per endpoint (it maps the stored record to the wire and raises
   `AppError`), publishes the event after the write, then the exported rules other modules need.
6. `routes.py`: `router: APIRouter` and one `router.add_api_route(...)` per endpoint, with its
   gates as `dependencies=[Depends(...)]`. A rate limit is `rate_limit(name=, limit=, window=,
   key=)` from `middleware/rate_limit.py` with the key `by_ip` (an IPv6 address by its /64
   network, an IPv4 address as is), `by_body_string(field)` or `by_body_path(...)`; it runs
   before the body is validated. A collection endpoint's path is `""`, not `"/"`: with
   redirect slashes off, `"/"` under the `/api/<name>` prefix would serve and document
   `/api/<name>/`.
7. One line in `config/routes.py`, the component names in `COMPONENTS` in `openapi.py`, then the
   `contract` command (`uv run poe contract`), then `check`.

Start by copying `api/module/` and `models/module/`, renaming in directories, files, identifiers,
comments and constants: `module` to `<name>`, `Module` to `<Name>`, `MODULE` to `<NAME>`. The
docstring of each file says what belongs there and what does not. Drop the reference module (both
directories, its line in `config/routes.py`, its names in `COMPONENTS`, `MODULE_CREATED` and
`ModuleCreated` in `services/event.py`, `RATE_LIMITS.create_post_per_ip` in `config/constants.py`,
`tests/test_module.py`) once a real one exists, then regenerate `openapi.json` with the `contract`
command.

- One declaration, one validator: the handler's parameters are typed from `schema.py`, so FastAPI
  validates the request and the contract documents the same types.
<!-- @auth-start -->
- Fail closed. `routes.py` mounts `require_auth` (or `require_role(UserRole.admin)` where a role is
  needed) as a dependency; the handler calls `require_caller(request)` and checks the role again,
  so an endpoint mounted without its gate still refuses. A rule that takes a caller acts only on
  that caller's own data.
<!-- @auth-end -->
<!-- @noauth-start -->
- Every endpoint is public: no gate, no caller. A plan that adds accounts adds both.
<!-- @noauth-end -->
- Every list endpoint paginates with `PageQuery` and `Page[T]` from
  `services/utils/pagination.py`: `?cursor=&limit=` in, `{ items, nextCursor }` out. The service
  fetches `limit + 1` rows and `to_page` slices; the cursor is opaque to clients and read back
  with `decode_cursor`.
- Another module is reached only through its exported controller rules, never its `service.py`.
<!-- @database:postgres-start -->
- A module with data ships its table in a migration (see Adding the data layer), and its
  `service.py` is written like `api/module/service.py`: a row dataclass, one `_to_record` mapping,
  an optional last `db` keyword on every query.
<!-- @database:postgres-end -->
- The wire is camelCase and Python is snake_case; the alias generator says so once. A request
  accepts camelCase only, and a body is strict: `"5"` is not a number. A field that should convert
  a string opts out with `Field(strict=False)`; a query model is lax.
- Optionality: `name: str | MISSING = MISSING` (absent allowed, `null` rejected),
  `phone: str | None` (always present, may be `null`), `phone: str | MISSING | None = MISSING`
  (absent keeps, `null` clears, a value sets). Use `from pydantic import MISSING`.
- A wire enum is a `Literal[...]` alias, never an `Enum`. A timestamp on the wire is a `str` from
  `clock.to_iso`. A schema pattern spells its classes out (`[0-9]`, `[A-Za-z0-9_]`), never `\d` or
  `\w`: pydantic's regex engine is Unicode. A test sends Arabic-Indic digits.
- A string length limit counts code points (`len`), not UTF-16 units: a limit of 8 accepts 8 emoji,
  where the TypeScript template counts 16. Test a limit with the same number of characters.
- A model is a contract component only when its name is in `COMPONENTS`; every other model is
  inlined. Each route lists its error responses with `error_responses(...)`.
- A handler that sets cookies or `Cache-Control` declares a `response: Response` parameter.
- Paths are singular (`/api/post`, `/api/post/{id}`), bodies are JSON only. Statuses: 200 read and
  update, 201 create (the created resource), 204 delete (no body), 400 validation,
<!-- @auth-start -->
  401 unauthenticated, 403 forbidden,
<!-- @auth-end -->
  404 missing, 409 conflict.

`api/module/` is the worked example.

## Adding the data layer

<!-- @nodatabase-start -->
The data-layer task swaps `infra/memory.py` for a real engine behind The engine seam. It
delivers:

1. `infra/<engine>.py`: the client and its `Resource` (`connect` with bounded retry through
   `with_retry`, `ping` as the cheapest round trip, `close`), joining `dependencies` in
   `infra/dependency.py` (`memory` stays until the cache task has replaced `services/cache.py`,
   whose TTL sweep starts in its `connect()`); no connecting at import, since `check` imports
   `app` without Docker.
2. `services/db.py` rewritten to export the engine client (its type changes).
3. Every module's `service.py` rewritten against it, signatures unchanged. <!-- @noauth -->
3. Every module's `service.py` and `services/session.py`, signatures unchanged. <!-- @auth -->
4. `model.py` where the engine defines storage in code, held to `models/<name>/interface.py`.
5. `infra/scripts/migrate.py` and a `migrate` task in `[tool.poe.tasks]` of `pyproject.toml`; the
   script runs its loop with `asyncio.run(main(), loop_factory=selector_loop_factory)`.
6. `DATABASE_URL` in `config/env.py` and `.env.example`; the engine's Compose service at the
   project root (`docker compose up -d --wait <service>`).
7. A test database, a `testDb` task and `tests/store.py` rewritten for the engine (below).

Every engine: a record has a string `id` and `created_at` and `updated_at` set on every write; an
unreachable store surfaces as `AppError("upstream_unavailable", ...)`; a transaction belongs to one
module's controller and never spans modules. For an SQL engine every query function in a module's
`service.py` takes the client or an open transaction as an optional last argument (one `Executor`
type covers both, defaulting to the client). A controller cannot import `services/db.py`, so the
module's `service.py` exports a `with_transaction` helper; the controller opens it and passes the
handle to each query. Every field a query filters or sorts on is indexed, including the
`(created_at, id)` pair behind cursor pagination; a change to the stored shape ships its migration
or index definition in the same task. A database driver runs on the selector loop
(`infra/loop.py`), never on Windows' default Proactor loop. Dropping or resetting a database is a
human's job.
Auth assumes: `rotate_session` is a conditional update, so one rotation wins; email is <!-- @auth -->
unique, phone only among verified phones (a partial unique index). <!-- @auth -->

Test database: a second database `app_test` on the same service. `testDb` runs the whole suite
with a pytest plugin that points the database URL at `app_test` before `config/env.py` loads. A
suite that touches the store reaches it only through the test seam `tests/store.py`
(`store_backed`, `reset_store`, `record_exists`, `delete_record`), which the data-layer task
rewrites for the engine: the `store_backed` marker skips unless the database name ends in `_test`,
and `reset_store()` refuses to truncate any other. Then `check` skips the store-backed suites and
`testDb` runs the whole suite; tests that only the engine can answer live in `tests/db/`.

- Postgres: migrations are SQL files applied in order by `migrate`. Singular snake_case tables
  and columns; `service.py` maps rows to the record. The index ships with the migration that
  needs it. `reset_store()` truncates.
- MongoDB: the `pymongo` async client. Singular collections, camelCase fields. `model.py` exports
  the collection name, document type and index definitions; `migrate.py` creates the indexes and
  runs backfills when a stored shape changes. Transactions need a replica set.
- Cache (Redis or Valkey), its own task: `services/cache.py` over `infra/redis.py` (a `Resource`),
  same helpers; keys prefixed, always with a TTL; `incr` sets the TTL on the first increment only;
  `infra/pubsub.py` gets its adapter.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
The data layer is in place: this project was generated with `database/postgres`. It holds:

- `infra/postgres.py`: the `Resource` over a psycopg 3 async pool (nothing connects at import: the
  pool is built on first use behind an `asyncio.Lock`, and `close()` forgets it, because a pool
  cannot be reopened), in `dependencies` beside `memory`, which stays as the cache until the cache
  task.
- `services/db.py`: the seam (`get_db()`, `Executor`, `fetch_one`, `fetch_all`, `execute`; see The
  engine seam).
- Every module's `service.py` in SQL. `api/module/service.py` is the reference: a row dataclass,
  one `_to_record` mapping from snake_case columns to the record, `with_transaction`, and cursor
  pagination over `(created_at, id)`. `model.py` stays unused. <!-- @noauth -->
  pagination over `(created_at, id)`. `api/user/service.py` and `services/session.py` are in SQL <!-- @auth -->
  too. `model.py` stays unused. <!-- @auth -->
- `infra/migrations/` (shipped inside the `app` package), `infra/scripts/migrate.py` and the
  `migrate` task in `[tool.poe.tasks]`.
- `services/utils/postgres_error.py`, applied by `middleware/error_handler.py` (see Errors).
- `DATABASE_URL` in `config/env.py` and `.env.example`, the `database` service in the project's
  `docker-compose.yml` with its `db/init.sql`, and the test seam and `test-db` (below).

Every record has a `text` `id` the application generates, and `created_at` and `updated_at` set on
every write. A transaction belongs to one module's controller and never spans modules. Dropping or
resetting a database is a human's job.

Changing the data model, in this order:

1. Write the failing test first, in a suite marked `store_backed` (see Tests).
2. Add `src/app/infra/migrations/NNNN-<topic>.sql`: the next four-digit number, a kebab-case topic,
   plain SQL. Files apply in name order. Each file runs once, in one transaction together with its
   row in `schema_migration`, so it holds no statement that cannot run in a transaction (`create
   index concurrently`). Never edit or rename an applied migration: a change is a new file.
   `0001-init.sql` is the reference.
3. Tables and columns are singular snake_case (a reserved word such as `"user"` is quoted),
   timestamps are `timestamptz`.
4. An index ships with the migration that needs it: every column a query filters or sorts on,
   including the `(created_at, id)` pair behind cursor pagination.
5. Update the module's `service.py`, its row dataclass and `_to_record`, and
   `models/<name>/interface.py`.
6. `uv run poe migrate`, then `uv run poe test-db`, then `uv run poe check`.

The `module` table in `0001-init.sql` belongs to the reference module. Drop it with a new migration
once the module is removed, unless no database has applied `0001-init.sql` yet.

Commands:

- `uv run poe migrate` applies the files `schema_migration` does not list, in name order, and logs
  each one. It takes a Postgres advisory lock, so two runs started together take turns. A file that
  fails leaves itself unapplied (its transaction rolls back) and the command exits 1. The server
  never migrates on its own. It runs on the selector loop (`asyncio.run(main(), loop_factory=
  selector_loop_factory)`).
- `uv run poe test-db` runs the whole suite against `app_test`.

Local service: `docker compose up -d --wait database` at the project root starts Postgres 17 on
`127.0.0.1:5432` and returns when it is healthy (`migrate` has no connect retry, and on a fresh
volume the image is not ready right away). `DATABASE_URL` is a secret, since it carries the
password: required in production, defaulted outside it to `postgres://app:app@127.0.0.1:5432/app`
(the entry warns once, like any defaulted secret), and it must be a `postgres://` or
`postgresql://` URL. The default host is `127.0.0.1`, not `localhost`: the service publishes on
loopback IPv4 only, and on Windows `localhost` resolves to `::1` first, where nothing answers, so
every new connection would wait out its 2 s `connect_timeout`. Keep `127.0.0.1` in `DATABASE_URL`
and `TEST_DATABASE_URL` for local work. In `docker-compose.yml` it is wired as a plain
`${DATABASE_URL}` with no default, like the other production secrets: the backend runs with
`APP_ENV: production`, so an unset variable (Compose passes an empty string) stops it at startup
with a message naming `DATABASE_URL`. To run the full stack locally, export a `DATABASE_URL`, e.g.
`postgres://app:app@database:5432/app` to use the bundled service. Production does not refuse
those bundled credentials themselves: exporting them is a conscious choice. The bundled `database`
service and the backend's `depends_on` on it stay, because the compose file is the local stack.

Test database: `app_test` on the same service, created by `db/init.sql` when the volume is first
created; a volume that already existed needs `create database app_test owner app;` run once by
hand. `tests/db/plugin.py`, loaded by `test-db` (`pytest -p tests.db.plugin`, never by `check`):

- points `DATABASE_URL` at `TEST_DATABASE_URL` (default
  `postgres://app:app@127.0.0.1:5432/app_test`) in `pytest_load_initial_conftests`, before
  `config/env.py` loads (`pytest_configure` is too late: `tests/conftest.py` imports the app
  first), and refuses a database whose name does not end in `_test`;
- applies the migrations once and, when the database cannot be reached, exits 1 with one line
  saying so;
- fails the session when every `store_backed` test was skipped, so `test-db` cannot pass on zero
  tests;
- owns the pool in an async session fixture, which keeps one event loop for the whole run (anyio
  would otherwise start a loop per test), because a pool is never reused across loops.

Never fake the database: a test that needs a result from Postgres runs against `app_test`.

E2E database: `app_e2e` on the same service, for a browser suite. `uv run poe e2e-db` reads
`E2E_DATABASE_URL` (default `postgres://app:app@127.0.0.1:5432/app_e2e`), creates the database when
it is missing (through the server's `postgres` maintenance database, same credentials), applies the
migrations and truncates every table except `schema_migration`. It refuses a name that does not
end in `_e2e`. Run it before each e2e run; the server under test starts with `DATABASE_URL` set to
the same URL. The script reads `E2E_DATABASE_URL` and sets `DATABASE_URL` itself before the first
import that reads the environment, as the test plugin does; `config/env.py` never sees the e2e URL.

Production: the server never migrates on boot. In the Compose stack the one-shot `__PACKAGE_DIR__-migrate`
service (app profile) runs `python -m app.infra.scripts.migrate` from the backend's image with the
same environment, and the backend waits for it to finish successfully: `docker compose --profile
app up --build` applies the migrations before the backend starts, and the backend does not start
if they fail. The `.sql` files ship inside the wheel, so the image needs no source tree. To run it
alone: `docker compose --profile app run --rm __PACKAGE_DIR__-migrate`; like the app, it needs the
production secrets and `DATABASE_URL` exported. `uv run poe migrate` stays for local development.
Elsewhere the deploy pipeline runs the migrations before serving traffic and after every deploy
that ships one, from the same image and with the same environment as the server (the env module
validates all of it). A migration the old version must survive is written backwards compatible,
since the old image keeps serving until the new one starts.

Auth assumes, as built: <!-- @auth -->
`rotate_session` is one conditional update (`where id = … and token_hash = <presented hash> and <!-- @auth -->
revoked_at is null`), so one rotation wins; the loser re-reads and answers from the grace window <!-- @auth -->
or is refused as a replay. There is no per-session lock. `revoke_session` and <!-- @auth -->
`revoke_all_sessions` are single filtered updates that also clear `grace_token`, and <!-- @auth -->
`purge_expired(now)` is one delete of the revoked and expired rows that returns their count. <!-- @auth -->
Time comes from the caller, never from `now()` in SQL. `user.email` has a unique index (the <!-- @auth -->
controller lower-cases it); `user.phone` is unique only among verified phones (a partial unique <!-- @auth -->
index where `phone_verified_at is not null`). `session` is indexed on `user_id` and `expires_at` <!-- @auth -->
and has no foreign key to `"user"`: modules stay independent. <!-- @auth -->

The cache is its own task: `services/cache.py` over `infra/redis.py` (a `Resource`), same helpers;
keys prefixed, always with a TTL; `incr` sets the TTL on the first increment only;
`infra/pubsub.py` gets its adapter.
<!-- @database:postgres-end -->

## Errors

Controllers and services raise `AppError(code, message, details)` from `services/utils/error.py`;
only `middleware/error_handler.py` builds an error response.

| Code | Status | Use for |
| --- | --- | --- |
| `validation_failed` | 400 | bad input; `details` is `{ path, message }[]` |
| `unauthenticated` | 401 | missing, invalid or expired token; wrong credentials | <!-- @auth -->
| `forbidden` | 403 | authenticated but not allowed: role, blocked account, another user's data | <!-- @auth -->
| `not_found` | 404 | missing resource, or one the caller may not know exists |
| `conflict` | 409 | state conflict, duplicate key |
| `payload_too_large`, `unsupported_media_type`, `rate_limited` | 413, 415, 429 | body limits; throttling |
| `internal` | 500 | unexpected |
| `upstream_unavailable` | 503 | a dependency failed; safe to retry later |

The envelope is `{ "error": { "code", "message", "details"? }, "requestId" }` (`ErrorBody`, also in
`openapi.json`); `details` is absent, not null, when there are none. `AppError` may carry response
`headers` (`Retry-After` on a 429). A validation failure is a 400 naming the first failing part
(`body`, then `query`, then `params`) and that part's failing fields with dotted paths. The message
text is pydantic's ("String should have at least 1 character"), not zod's: a test asserts the
`code`, the part and the path, never the wording. FastAPI's own 422 never leaves the server.
Malformed JSON is a 400 `malformed JSON body`, and a body that is not JSON on a JSON route is a 400
`invalid body`. A body over 1 MB is a 413, a JSON charset that does not start with `utf-` or a
compressed body is a 415, an unknown path or a wrong method is a 404, and a trailing slash is a
404, never a redirect.

Anything that is not an `AppError` leaves as a bare `internal` envelope from the catch-all
middleware, so the 500 still carries the request id and the security headers; its stack is logged
once with the request id and never sent, nor is query text or a secret. Log through
`services/logger.py`: one line per request, every unexpected error with its stack, ids and never
payloads, secret-looking keys redacted.
<!-- @database:postgres-start -->

Postgres errors are mapped in one place, `classify_postgres_error` in
`services/utils/postgres_error.py`, which the catch-all in `middleware/error_handler.py` calls
before its `internal` fallback. A connection that is refused, lost or timed out (a
`psycopg.OperationalError` with no SQLSTATE, `PoolTimeout` and `PoolClosed` among them), and a
server that is starting, shutting down or out of connections, answer 503 `upstream_unavailable`
with the fixed message "the database is unavailable". A unique violation (SQLSTATE 23505) answers
409 `conflict` with "the record already exists", so a request that loses a race on a unique index
needs no `try` in the controller. Any other database error is `internal`. The driver's text, the
query, the detail and the constraint name stay in the server log.
<!-- @database:postgres-end -->

Every endpoint's test covers its validation failure and its not-found path, asserting the
envelope's `code` and `requestId`, not only the status.
A gated endpoint also tests its 401 and, where it checks a role, its 403. <!-- @auth -->

## Tests

- `pytest` with an `httpx.AsyncClient` over `ASGITransport` against `app` from `server.py` (the
  `client` fixture in `tests/conftest.py`; `http_client` in `tests/support.py` for another app),
  never `main.py` and never live infrastructure. `base_url="https://testserver"` so a Secure cookie
  is sent, and the transport's `client=` sets the peer for the proxy tests. Starlette's
  `TestClient` is not used: its portal thread runs its own event loop. Async tests run under the
  anyio plugin (`anyio_mode = "auto"`) on the selector loop (`anyio_backend` in
  `tests/conftest.py`).
- `tests/` mirrors `src/app/` and is a package throughout: `tests/test_<name>.py` per module, the
  rest in `tests/middleware/`, `tests/services/` and `tests/infra/`. `tests/conftest.py` sets
  `APP_ENV=test` before any `app` import, because `config/env.py` reads the environment once.
  `tests/probe.py` builds a throwaway app with extra routes for a test that pins what every module
  relies on.
- Time is moved with `time-machine` (`time_machine.travel(..., tick=False)`). An event's effect is
  asserted after `await drain()` from `services/event.py`. Each store-backed test file empties the
  store itself, for example with an autouse fixture that awaits `reset_store()`.
<!-- @auth-start -->
- Cookie attributes come out as `expires=` and `SameSite=lax` (Python's `http.cookies`), so a
  cookie test compares attribute names and these values case-insensitively.
<!-- @auth-end -->
- The other intentional differences from the TypeScript template are listed in the Deviations
  section of ADR 0002 in the template catalog.
<!-- @auth-start -->
- Messages are captured through a provider registered with `register_provider`: `capturing()` in
  `tests/auth_support.py` does it and resets the providers afterwards.
<!-- @auth-end -->
- `RATE_LIMIT_SCALE` (a number from 1 to 1000, default 1) multiplies every limit in `RATE_LIMITS`,
  rounded up; `middleware/rate_limit.py` applies it. An e2e run raises it so a journey suite is not
  limited; production keeps 1. There is no switch that turns limiting off.
- Pytest captures what a test prints or logs, so a green run shows no stack trace for an error a
  test raises on purpose; keep it that way (no `-s` or `--log-cli-level` in a gate command).
- A suite that stores records, and any test that resets or inspects them, goes through the seam
  `tests/store.py`: the `store_backed` marker wraps the suite, `reset_store()` empties the store,
  `record_exists(collection, id)` and `delete_record(collection, id)` read and remove one record.
<!-- @nodatabase-start -->
  `store_backed` is always live here; the data-layer task rewrites the seam for the engine (see
  Adding the data layer).
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
  `store_backed` skips unless `DATABASE_URL` names a database ending in `_test`, so `check` skips
  the store-backed suites and `testDb` runs the whole suite against `app_test`. `reset_store()`
  truncates every table except `schema_migration`, clears the cache, and raises on a database whose
  name does not end in `_test`. This seam holds the one `skipif` of the suite: nothing else skips.
  A test that only Postgres can answer (a unique index, a transaction) lives in `tests/db/` under
  `store_backed`. The error classifier test is `tests/services/test_postgres_error.py`: a plain
  test that runs in `check`. A test of the cache or the rate limits empties `memory` directly
  (`await memory.close()`), because `reset_store()` needs a database. A store reset fixture
  belongs to a store-backed file or class, never to a plain one: it would break `check` there.
  Never fake the database.
<!-- @database:postgres-end -->
- A test that spawns a process (the entry test) is synchronous and uses `subprocess.run`: the
  selector loop cannot run asyncio subprocesses on Windows.
- A test that pins a behaviour carried over from the TypeScript template names it in its docstring
  (`"""Row: Request id."""`).
- `tests/test_openapi.py` fails on a stale `openapi.json`: run the `contract` command.
- `filterwarnings = ["error"]`: a warning fails the suite. A targeted ignore names the warning and
  carries its reason on the line.
- Every new behaviour gets a happy-path test and at least one failure or empty-path test. No
  `pytest.mark.skip`, `pytest.mark.skipif`, `pytest.mark.xfail`, `pytest.skip(`, `pytest.xfail(`,
  `pytest.importorskip(`, `unittest.skip`, `unittest.skipIf`, `unittest.skipUnless` or
  `self.skipTest(`; no `-k`, `-m "not ..."`, `--deselect`, `--ignore` or `--ignore-glob` in a gate
  command (pytest has no `.only`; these narrow the run the same way); no `collect_ignore` or
  `collect_ignore_glob` in a `conftest.py`; and none of those options in `addopts` in
  `pyproject.toml`. A removed test is named and justified in the stage report. `check` never needs
  Docker.

## Deployment

The server ships in one of two deploy modes, `single` or `split`; the project's mode is recorded
in `.doc/architecture.md` (Operational Concerns › Deployment). The code is the same in both. Only
the `Dockerfile` and the Compose fragment differ, through the lines named below, and the harness's
`deployment` skill moves a project between them.

- **Image.** Multi-stage `Dockerfile`: uv builds a locked, no-dev virtualenv, then only that and
  `src/` are copied (and `public/` in `single`). The container runs as the non-root `app` user and
  listens on `8000`.
- **Compose service.** The root `docker-compose.yml` builds the package from its `Dockerfile`
  under the `app` profile, so `docker compose --profile app up --build` starts it. With the
  Postgres capability, a `<dir>-migrate` service runs the migrations first and shares the image.
  Stop the stack with `docker compose --profile app down`: a plain `docker compose down` does not
  see the profiled service and leaves it running.
- **Static serving (`STATIC_DIR`).** `STATIC_DIR` names a built single-page app, which
  `src/app/middleware/static_files.py` (a `StaticFiles` subclass) serves. `src/app/server.py` mounts it
  last in the router, after the API routes and `/openapi.json`. Unset or blank (the default, and always in `split`), nothing is mounted. Set, it
  is resolved to an absolute path once, and in production the process refuses to boot when the
  directory has no `index.html`. Outside production a missing directory is not fatal: every page is
  the JSON 404. The behaviour is the same in every server template:

  | Request | Response |
  | --- | --- |
  | GET or HEAD of an existing file | The file. `assets/*` gets `Cache-Control: public, max-age=31536000, immutable`; every other file, `index.html` included, gets `no-cache`. |
  | GET or HEAD of an extension-less path outside `/api` | `index.html`, `no-cache`. |
  | A path with an extension and no file | The 404 envelope. |
  | `/api` or `/api/*` with no route, in any letter case or encoding | The 404 envelope, never the shell. |
  | Another method on a non-API path | The 404 envelope. |
  | A dotfile (`/.well-known/*` too), an encoded traversal, a symlink out of the directory or a directory | The 404 envelope. Never a listing. |

  Every static response carries the security headers (the CSP included) and the request id. The
  server does not compress; the host's edge does. A product that needs `/.well-known/*` adds a
  route by plan.
- **`single`.** One image holds the API and the SPA. The `Dockerfile` copies the SPA from the
  `spa` build context (the frontend's `dist` target) and sets `STATIC_DIR`. The Compose service adds `build.additional_contexts: { spa: "service:<frontend dir>" }`, which
  copies from the frontend's build-only service (`scale: 0`, no container), and publishes
  `8000:8000` on every interface: the server is the public edge. `TRUST_PROXY` defaults
  to `false`, so no caller can choose its own client IP through `X-Forwarded-For`. This needs
  Docker Compose 2.35.0 or later; an older client fails with a message that does not name the cause.
  The `spa` context exists only in Compose, so a plain `docker build` of this package fails in
  `single` ("pull access denied for spa"). Build it with `docker compose --profile app build`; a
  builder that cannot use Compose passes the context itself: `docker buildx build --target dist
  --output type=local,dest=<dir> <frontend dir>`, then `docker buildx build --build-context
  spa=<dir> <server dir>`. Or switch to `split`. Do not delete the `single` lines to make a plain
  build pass: the image would serve no SPA.
- **`split`.** The `Dockerfile` has no SPA lines and `STATIC_DIR` is unset. The Compose service has
  `build: ./<dir>` and publishes `127.0.0.1:8000:8000`, loopback only: the frontend container
  reaches the server on the Compose network and nothing else on the host network can.
  `TRUST_PROXY` defaults to `1`, because the frontend container (the Next.js server, or the SPA's
  nginx) in front is one proxy hop and the rate limits are keyed by client
  IP (an IPv6 address by its /64 network, an IPv4 address as is).
- **`TRUST_PROXY` in production.** The server's own default, `.env.example` included, is `false`.
  Set the real hop count of the deployment: behind a PaaS edge it is usually `1`, behind a CDN and
  a load balancer `2`. Too high lets a caller choose its own rate-limit key through
  `X-Forwarded-For`, too low keys every caller to the proxy.
- **TLS.** The container speaks HTTP and the CSP keeps `upgrade-insecure-requests`, so an edge
  terminates TLS. Over plain HTTP at a host other than loopback the browser upgrades the page's
  requests to HTTPS and the page is blank.
- **Secrets.** Production values come from the shell environment or a secret manager; Compose
  reads `${VAR}` and never stores them.

**The lines of each mode.** Switching mode edits exactly these lines, copied from this package's
`compose.yaml` and `Dockerfile`, so they cannot drift. A generated project holds only the lines
of its own mode, so copy the other mode's from here. The Compose lines sit under this package's
service in the root `docker-compose.yml`, indented four spaces; the generated file may spell the
`ports` list with spaces inside the brackets, which is the same YAML. `<frontend dir>` is the
frontend's directory in `.fullstack/catalog.yaml`. The frontend's own lines are in its
`AGENTS.md › Deployment`.

Compose, `single`:

```yaml
# Single: the image also holds the SPA, copied from the frontend's build-only service (the
# Dockerfile's `spa` context; Compose 2.35.0 or later).
build:
  context: ./__PACKAGE_DIR__
  additional_contexts:
    spa: service:<frontend dir>
environment:
  # (the other environment entries stay)
  # Single: the server is the edge, so no proxy hop is trusted; IP-keyed rate limits use the socket
  # address. Behind a production edge set the hop count (a PaaS edge is usually 1).
  TRUST_PROXY: ${TRUST_PROXY:-false}
# (the other service keys stay)
# Single: the server is the public edge, so it publishes on every interface. With TRUST_PROXY
# false no caller can choose its own client IP through X-Forwarded-For.
ports: ["__PORT__:__PORT__"]
```

Compose, `split` (replaces the `single` lines above):

```yaml
build: ./__PACKAGE_DIR__
environment:
  # (the other environment entries stay)
  # Split: the frontend container (the Next.js server, or the SPA's nginx) is the one proxy hop;
  # IP-keyed rate limits depend on it.
  TRUST_PROXY: ${TRUST_PROXY:-1}
# (the other service keys stay)
# Split: loopback only, the frontend container reaches the backend on the compose network.
# Publishing the port on every interface with TRUST_PROXY=1 would let any direct caller
# choose its own client IP through X-Forwarded-For.
ports: ["127.0.0.1:__PORT__:__PORT__"]
```

`Dockerfile`, `single` only, between `COPY --from=builder /app/.venv /app/.venv` and the `ENV PATH` line. In `split` these three lines
(the comment, the `COPY` and the `ENV`) are absent, so delete them:

```dockerfile
# The built SPA from the frontend's `dist` target, served when STATIC_DIR names it.
COPY --from=spa --chown=app:app /dist ./public
ENV STATIC_DIR=/app/public
```
