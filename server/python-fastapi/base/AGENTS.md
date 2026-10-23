# Backend

The layer map of `backend/`. What holds for the whole repository (versions, commands,
definition of done) is in the repository's root `AGENTS.md`; nothing here repeats it. This
file ships with the package; an agent working in this directory loads it, and a planner or
reviewer reads it explicitly.

This is a Python 3.14 package managed by uv. Files and modules are snake_case (the only form an
import name can take); a name never shadows the standard library (`enums.py`, not `enum.py`;
`utils/clock.py`, not `utils/time.py`).

## Packages and conventions

- FastAPI with pydantic v2, served by plain `uvicorn` (with `watchfiles` for reload). Nothing else
  is added without a plan. There is no pydantic-settings and no `.env` loading: secrets never live
  in a file in the working tree.
- Types are strict: `mypy` runs in strict mode with the pydantic plugin and `disallow_any_explicit`,
  so there is no `Any`; use `object`, `JsonValue` or a narrower type. A `# type: ignore[code]`
  carries its reason on the same line. `ruff` selects `E F W I B UP A N ASYNC S DTZ RUF SIM PT ANN`
  at line length 100. Comments say why.
- Logging goes through `services/logger.py` (`log.info`, `log.warning`, `log.error`; one line, then
  `key=value` fields; a field whose key looks secret prints `[redacted]`). It configures the root
  logger, so uvicorn's records come out in the same format. One line per request comes from
  `middleware/request_log.py` (method, raw path without the query string, status, duration, request
  id), and every unexpected error is logged once with its stack by `middleware/error_handler.py`.
  Nothing else calls `print` or `logging`.
- Time: every expiry and window reads wall time through `services/utils/clock.py` (`now()`), never
  `time.monotonic()`, which `time-machine` does not move. Durations are `'15m'` strings parsed by
  `parse_duration`.
- Every infrastructure dependency is a `Resource` from `infra/dependency.py`, listed in
  `dependencies` in that file: connected at boot with bounded retry, pinged by
  `GET /api/health/ready`, closed in reverse on shutdown. This template lists the in-memory store
  (`memory`), the in-process bus (`pubsub`) and the scheduler (`scheduler`), in that order.
- One event loop class everywhere: `infra/loop.py` gives `selector_loop_factory`, which uvicorn
  and the tests' `anyio_backend` fixture use. Never run a database driver on Windows' default
  Proactor loop.

## Layer map

```
src/app/
  main.py             `app.main:app` with the infra lifespan; runs uvicorn; imported by nothing
  server.py           `create_app()` and `app`; never listens, attaches no infra
  openapi.py          builds, shapes and caches the contract; `--write` emits openapi.json
  config/             env.py · constants.py · cors.py · routes.py
  models/<name>/      interface · type · enums · constants: an entity's types (module: the reference)
  api/<name>/         routes · controller · schema; service only when the module has data
                      (module: the reference; health owns no data)
  middleware/         request_id · request_log · security_headers · cors · proxy · body_limit ·
                      error_handler · not_found · head · context · asgi · rate_limit (a gate)
  services/           logger.py · db.py · cache.py · event.py (the seams) ·
                      utils/ (error · openapi · clock · api_model · pagination)
  infra/              dependency.py · loop.py · memory.py · pubsub.py · scheduler.py
tests/                mirrors src/app/ (a package throughout, so two test_x.py cannot clash)
openapi.json          the committed contract, written by the `contract` command
```

`infra/jobs/` and `infra/subscribers/` (a job is a crontab pattern and an async function; a
subscriber reacts to a topic) arrive with the first one; `middleware/` gates for authentication and
roles arrive with the accounts. This file grows with them.

Where does X go: a limit of the data (a length) in `models/<name>/constants.py`, a policy (a window,
a count) in `config/constants.py`; a query in the module's `service.py`; a rule another module
needs in the controller (exported, no request or response); a reaction to an event in
`infra/subscribers/`; a stateful capability the services share in `services/`.

## Request flow

`config/routes.py → api/<name>/routes.py → gates → controller.py (handler, and any rule it shares)
→ service.py → db seam (services/db.py) → infra store (infra/memory.py)`. A `routes.py` holds nothing but one `router.add_api_route`
per endpoint, naming the handler, the status and response model, the error responses, the summary
and the gates (FastAPI dependencies, in declaration order, before body validation errors are
raised). A handler holds its endpoint's logic. Validation comes from the handler's signature:
FastAPI validates, and `middleware/error_handler.py` shapes the failure into the 400 envelope.

The middleware are pure ASGI, never `BaseHTTPMiddleware`. `server.py` adds them inner first, so the
order outer to inner is: security headers, CORS (only when `CORS_ORIGINS` is set), request id,
proxy (the client IP), request log, body limit, head, the catch-all. `head` runs a HEAD request as
GET and drops the body, so HEAD is answered wherever GET is. No middleware raises: one that
refuses a request sends the error envelope itself.

## Import direction

`import-linter` enforces the import direction (`uv run poe lint` runs it; the contracts are in
`pyproject.toml`): the leaves (`models/` imports `models/` only; `config/constants.py`,
`config/env.py` import nothing from the app; `config/cors.py` imports `config/env.py`),
`services/utils/` is pure, `config/routes.py` is the only importer of a `routes.py` and `server.py`
the only importer of `config/routes.py`, `middleware/` and `services/` never import `api/`, nothing
imports `main.py`, and a module's files import only what their role allows (a `schema` is the leaf,
a `controller` never imports its `routes`, a `service` is the data layer and never sees HTTP).

The seams are closed by default: a store (`infra/memory.py`, `infra/<engine>.py`) is imported by
`services/db.py` and `services/cache.py` only, the bus (`infra/pubsub.py`) by `services/event.py`
only, every other service reaches infra through `infra/dependency.py`. Only a module's `service`
uses `services/db.py`; only a `service` and `middleware/rate_limit.py` use `services/cache.py`;
only a controller publishes through `services/event.py`.

Module privacy, that a module's `service` is imported only from inside its own module, is an
`independence` contract over `api.*`: a controller imports another module's controller and schema,
a schema another module's schema, and nothing else crosses a module boundary. It is one point
stricter than bun-express's ESLint zone, which lets any file import another module's schema as a
type; import-linter cannot tell a type-only import. The rest is a review rule: a vendor SDK is
imported only by its own `services/<vendor>.py`; a `routes.py` holds nothing but the gates and the
handler per endpoint; another module or a job calls a controller's exported rules, never a handler;
a cross-module flow is not atomic.

## Adding a module

Work in this order, test first.

Copy `models/module/` and `api/module/`, the reference; the docstring of each file says what
belongs there and what does not.

1. Types in `models/<name>/` (`interface` the stored record, `type` the public shape and inputs,
   `enums`, `constants`). A record is a frozen dataclass; models import no pydantic.
2. `schema.py`: pydantic models. A request body derives from `RequestModel`, a query from
   `QueryModel`, a response from `ResponseModel` (`services/utils/api_model.py`). A list's page is
   a concrete subclass of `Page[T]` (`class ModulePage(Page[Module])`), its query is `PageQuery`.
3. `tests/test_<name>.py` (see Tests), red.
4. `service.py`, only when the module has data: queries through `get_db()`, one collection per
   entity, and a cursor model for `decode_cursor` when the list pages.
5. `controller.py`: one handler per endpoint (it maps the stored record to the wire and raises
   `AppError`), publishes the event after the write, then the exported rules other modules need.
6. `routes.py`: `router: APIRouter` and one `router.add_api_route(...)` per endpoint, with its
   gates as `dependencies=[Depends(...)]`. A rate limit is `rate_limit(name=, limit=, window=,
   key=)` from `middleware/rate_limit.py` with `by_ip`, `by_body_string(field)` or
   `by_body_path(...)`; it runs before the body is validated. A collection endpoint's path is `""`,
   not `"/"`: with redirect slashes off, `"/"` under the `/api/<name>` prefix would serve and
   document `/api/<name>/`.
7. One line in `config/routes.py`, the component names in `openapi.py`'s `COMPONENTS`, then the
   `contract` command.

The wire format is fixed by the three bases:

- The wire is camelCase and Python is snake_case; the alias generator says so once. A request
  accepts camelCase only, and a body is strict: `"5"` is not a number. A field that should convert
  a string opts out with `Field(strict=False)`; a query model is lax.
- Optionality: `name: str | MISSING = MISSING` (absent allowed, `null` rejected),
  `phone: str | None` (always present, may be `null`), `phone: str | MISSING | None = MISSING`
  (absent keeps, `null` clears, a value sets). Use `from pydantic import MISSING`.
- A wire enum is a `Literal[...]` alias, never an `Enum`. A timestamp on the wire is a `str` from
  `clock.to_iso`. A schema pattern spells its classes out (`[0-9]`, `[A-Za-z0-9_]`), never `\d` or
  `\w`: pydantic's regex engine is Unicode. A test sends Arabic-Indic digits.
- A model is a contract component only when its name is in `COMPONENTS` in `openapi.py`; every
  other model is inlined. Each route lists its error responses with `error_responses(...)`.
- Paths are singular (`/api/post`, `/api/post/{id}`), bodies are JSON only. Statuses: 200 read and
  update, 201 create (the created resource), 204 delete (no body), 400 validation, 404 missing,
  409 conflict.
- A handler that sets cookies or `Cache-Control` declares a `response: Response` parameter.

`api/health/` is the worked example for the routes, controller and schema files.

## Adding the data layer

The store is `infra/memory.py`: a record store and a key-value store held in process memory, one
`Resource`. The seams are files, not types: `services/db.py` exports `get_db()` (a record store,
`collection(name, RecordType)` with `get`, `put` (upsert), `delete` and `find`), `services/cache.py`
the JSON helpers over the key-value store (`get(key, TypeAdapter)`, `set_value`, `delete`, `incr`),
`services/event.py` the typed bus (`publish`, `subscribe`, `drain`; a `Topic` constant carries its
payload type). A database overlay rewrites `services/db.py` to export its client, rewrites every
`service.py` against it and adds `infra/<engine>.py` to `dependencies`; the data-layer rules of the
`database` skill apply. The scheduler (`infra/scheduler.py`, APScheduler) starts in `connect()`
unless `JOBS_ENABLED=false`, runs each job with one instance at a time, and its job list is empty
here. Every expiry reads `services/utils/clock.py`, never `time.monotonic()`.

## Errors

Controllers and services raise `AppError(code, message, details)` from `services/utils/error.py`;
only `middleware/error_handler.py` builds an error response.

| Code | Status | Use for |
| --- | --- | --- |
| `validation_failed` | 400 | bad input; `details` is `{ path, message }[]` |
| `unauthenticated` | 401 | missing, invalid or expired token; wrong credentials |
| `forbidden` | 403 | authenticated but not allowed |
| `not_found` | 404 | missing resource, or one the caller may not know exists |
| `conflict` | 409 | state conflict, duplicate key |
| `payload_too_large`, `unsupported_media_type`, `rate_limited` | 413, 415, 429 | body limits; throttling |
| `internal` | 500 | unexpected |
| `upstream_unavailable` | 503 | a dependency failed; safe to retry later |

The envelope is `{ "error": { "code", "message", "details"? }, "requestId" }` (`ErrorBody`, also in
`openapi.json`); `details` is absent, not null, when there are none. `AppError` may carry response
`headers` (`Retry-After` on a 429). A validation failure is a 400 naming the first failing part
(`body`, then `query`, then `params`) and that part's failing fields with dotted paths; the message
text is pydantic's. Malformed JSON is a 400 `malformed JSON body`, and a body that is not JSON on a
JSON route is a 400 `invalid body`, never a 415 or 422. A body over 1 MB is a 413, a JSON charset
that does not start with `utf-` or a compressed body is a 415, an unknown path or a wrong method is
a 404, and a trailing slash is a 404, never a redirect.

Anything that is not an `AppError` leaves as a bare `internal` envelope from the catch-all
middleware, so the 500 still carries the request id and the security headers; its stack is logged
once with the request id and never sent, nor is query text or a secret.

Every endpoint's test covers its validation failure and its not-found path, asserting the
envelope's `code` and `requestId`, not only the status.

## Tests

- `pytest` with an `httpx.AsyncClient` over `ASGITransport` against `app` from `server.py`, never
  `main.py` and never live infrastructure; `base_url="https://testserver"` so a Secure cookie is
  sent, and the transport's `client=` sets the peer for the proxy tests. Starlette's `TestClient`
  is not used. Async tests run under the anyio plugin (`anyio_mode = "auto"`) on the selector loop
  (`anyio_backend` in `tests/conftest.py`).
- `tests/` mirrors `src/app/` and is a package throughout. `tests/conftest.py` sets
  `APP_ENV=test` before any `app` import, because `config/env.py` reads the environment once.
- A store-backed suite is marked `store_backed` (`tests/store.py`) and resets the store through
  `reset_store()`, `record_exists(collection, id)` and `delete_record(collection, id)`, never
  through the store directly. An event's effect is awaited with `drain()`.
- Time is moved with `time-machine` (`time_machine.travel(..., tick=False)`).
- A test that spawns a process (the entry test) is synchronous and uses `subprocess.run`: the
  selector loop cannot run asyncio subprocesses on Windows.
- Each behaviour-table row of the contract with bun-express has a test whose docstring names it
  (`"""Row: Request id."""`).
- `tests/test_openapi.py` fails on a stale `openapi.json`: run the `contract` command.
- `filterwarnings = ["error"]`: a warning fails the suite. A targeted ignore names the warning and
  carries its reason on the line.
- Every new behaviour gets a happy-path test and at least one failure or empty-path test. No
  `skip`, `xfail` or deselect; a removed test is named and justified in the stage report. `check`
  never needs Docker.
