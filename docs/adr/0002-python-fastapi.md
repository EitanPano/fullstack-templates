# ADR 0002: server/python-fastapi, the first template outside TypeScript

Status: proposed (2026-10-23)
Owner: Eitan
Plan: `fullstack-dev-harness/.plan/009-2026-10-23-python-fastapi.md` (milestone 4)
Amends: ADR 0001 (D2, D4, Constraints, Delivery order) and `docs/conventions.md`

## Context

ADR 0001 names `server/python-fastapi` as the first template after v1, and its Consequences
predict that "the first non-TypeScript template will stress D4". It did. Research for plan 009
found the catalog machinery npm-only in five places:

- the dependency adapter enum (`npm` only);
- the lockfile check (a frozen `bun install`);
- the ignore lists (`node_modules` only, so a `.venv` is copied and scanned);
- post-generate state (a `.venv` built in staging records the staging path and is moved with the
  tree);
- the unchecked `tools:` field.

`frontend/next` hard-codes `bun run dev` for its API web server. In the harness, the hooks do not
see through `uv run`, and several rules assume TypeScript idioms (kebab-case files, `.skip`).

This ADR fixes the Python template's design so that the port is mechanical. `server/bun-express`'s
tests are the executable specification: "parity" means the behaviour each of them asserts, not its
syntax. Where Python cannot or should not match, the deviation is listed here (Deviations), never
improvised.

The S1 spike (2026-10-23, Windows 11 and `python:3.14-slim`) proved the risky parts before this
ADR was written. Its findings are folded into the decisions; the evidence lives in the plan's
ledger.

## Decisions

### M4-1. Toolchain

- **uv** manages Python, the virtual environment and the lockfile. `[tool.uv] required-version =
  ">=0.12.23"`: a floor, because an older uv may not read the lock. CI, the release workflow and
  the Dockerfile pin uv exactly (0.12.23), so `uv.lock` is always written by one version. My call
  over an exact `==` pin: an exact pin hard-fails every developer whose uv is newer.
- **Python 3.14**: `.python-version` is `3.14`, `requires-python = ">=3.14,<3.15"`, ruff
  `target-version = "py314"`, mypy `python_version = "3.14"`, image `python:3.14-slim` (the
  builder and runtime stages use the same tag, because the venv's `python` is a symlink into the
  base image). 3.15 was rejected on 2026-10-23: the planned dependency set has no cp315 wheel for
  `pyyaml`. Moving is a template minor: four version strings and a re-lock.
- **Build backend `uv_build`**, src layout `src/app/`. The distribution and the import package are
  both `app`. `pyproject.toml` and `uv.lock` carry no placeholder, so `uv.lock` is copied byte for
  byte; `__PROJECT_NAME__` appears only in `config/constants.py` and the OpenAPI title.

### M4-2. Commands

Every command is one program, `uv run poe <task>`, except `install`. poethepoet is a dev
dependency; the image never uses it.

| Command | Value | Task |
| --- | --- | --- |
| `install` | `uv sync` | re-locks after flags and capabilities drop lines, prunes, installs |
| `dev` | `uv run poe dev` | `python -m app.main --reload` |
| `check` | `uv run poe check` | sequence `lint`, `format-check`, `typecheck`, `test`, fail-fast |
| `typecheck` | `uv run poe typecheck` | `mypy src tests lint_contracts` |
| `lint` | `uv run poe lint` | sequence `ruff check`, then `lint-imports` with `PYTHONUTF8=1` |
| `format` | `uv run poe format` | `ruff check --select I --fix`, then `ruff format` |
| `test` | `uv run poe test` | `pytest` |
| `contract` | `uv run poe contract` | `python -m app.openapi --write` writes `openapi.json` at the package root |
| `testDb` | `uv run poe test-db` | `pytest -p tests.db.plugin` (Postgres overlay) |
| `migrate` | `uv run poe migrate` | `python -m app.infra.scripts.migrate` (Postgres overlay) |

- `install` is plain `uv sync`, as `bun install` is plain for bun-express (ADR 0001 amendment R4).
  Drift is caught by `validate --lockfiles`, and the image installs with `--locked`.
- `PYTHONUTF8=1` on `lint-imports`: rich's legacy Windows renderer crashes on a NUL stdout without
  it (S1).
- poethepoet stays the runner: uv 0.12.23 has no task runner (`uv format` and `uv check` exist, but
  neither runs named tasks). If uv ships one, a template minor switches.

### M4-3. Dependencies through markers

- TOML has comments, so flag- and capability-bound dependency lines and poe tasks carry markers
  in base `pyproject.toml`, exactly like source lines: `"pyjwt>=2.15",  # @auth`,
  `"psycopg[binary,pool]>=3.3",  # @database:postgres`.
- The adapter value is `pyproject`. The loader refuses `dependencies` and `scripts` declarations
  in a `pyproject` template manifest or its capabilities, with "use markers in pyproject.toml".
  The `npm` adapter is unchanged.
- Base `uv.lock` is the superset lock: it is resolved from base `pyproject.toml`, where every
  marked line is present. Post-generate `install` (`uv sync`) re-locks after the marker pass has
  dropped lines; S1 showed that a removed dependency prunes it and its transitive-only
  dependencies and changes no other version.
- `validate --lockfiles` dispatches per adapter: a frozen `bun install` for `npm`, `uv lock
  --check` for `pyproject` (exit 0 in sync, 1 on drift).
- CONTRIBUTING: edit `pyproject.toml` by hand, then run `uv lock`. `uv add` rewrites the line and
  can drop a trailing marker.

### M4-4. Tree hygiene

- One ignore set serves both copying and listing (`tools/lib/files.ts`): `node_modules`, `.venv`,
  `__pycache__`, `.mypy_cache`, `.ruff_cache`, `.pytest_cache`, `.import_linter_cache`,
  `*.egg-info`, and the existing entries. The validate dry-run and the copier therefore see the
  same tree.
- A new manifest field, `dropAfterPostGenerate`, lists paths removed from the staged package after
  post-generate and before the move (python-fastapi: `.venv` and the tool caches). Removal retries
  on `EPERM`, `EBUSY` and `EACCES`, as the move does. A moved `.venv` is a trap: its editable
  `.pth` still points at the staging directory, so `import app` silently loads the staged source
  (S1). The first `uv run` in the final location creates a fresh one (about 15 s cold).
- Post-generate runs with `PYTHONDONTWRITEBYTECODE=1`, so no `__pycache__` lands in the source
  tree and the same inputs give the same tree (D6).

### M4-5. Tools preflight

When post-generate is going to run, the generator checks each planned template's `tools` before
staging: it resolves the program through `resolveCommand`, runs `--version`, parses the first
semantic version in the output and compares it with `min`. A failure names the tool, the version
found (or "not found") and the minimum. python-fastapi declares `{ name: uv, min: '0.12.23' }`;
uv provides Python itself.

### M4-6. File mapping

| bun-express | python-fastapi |
| --- | --- |
| `src/index.ts` | `src/app/main.py`: composes the infra lifespan into the app, runs uvicorn programmatically (`python -m app.main [--reload]`) |
| `src/server.ts` | `src/app/server.py`: `create_app(lifespan=None)` and `app = create_app()`; attaches no infra, so tests never start any |
| `src/openapi.ts` | `src/app/openapi.py`: builds and shapes the document (M4-9); `python -m app.openapi --write` |
| `src/config/{env,constants,cors,routes}.ts` | `src/app/config/{env,constants,cors,routes}.py`; `routes.py` exports `register_routes(app)` |
| `src/api/<m>/{routes,controller,schema,service}.ts` | `src/app/api/<m>/{routes,controller,schema,service}.py`; `routes.py` exports `router: APIRouter` |
| `src/models/<n>/{interface,type,enum,constants}.ts` | `src/app/models/<n>/{interface,type,enums,constants}.py` |
| `src/middleware/{auth,role,rate-limit}.ts` | `src/app/middleware/{auth,role,rate_limit}.py`: FastAPI dependencies (the gates) |
| `src/middleware/{request-id,request-log}.ts` | `src/app/middleware/{request_id,request_log}.py`: pure ASGI middleware |
| `helmet()`, `express.json({ limit })`, `trust proxy` | `src/app/middleware/{security_headers,body_limit,proxy}.py`: pure ASGI middleware |
| `src/middleware/{error-handler,not-found}.ts` | `src/app/middleware/{error_handler,not_found}.py`: exception handlers plus the innermost catch-all middleware (M4-8) |
| `src/middleware/validate.ts` | none: FastAPI validates from the handler's signature; `error_handler.py` shapes the 400 |
| `src/middleware/express.d.ts` | `src/app/middleware/context.py`: typed accessors for `request.state` (request id, caller, client ip) |
| `src/services/{db,cache,event,logger,session}.ts` | `src/app/services/{db,cache,event,logger,session}.py` |
| `src/services/security/{cookies,crypto,jwt,otp}.ts` | `src/app/services/security/{cookies,crypto,jwt,otp}.py` |
| `src/services/communicate/index.ts` and siblings | `src/app/services/communicate/__init__.py` and `{console,mail,sms,whatsapp}.py`, `templates/{otp,password_reset,welcome}.py` |
| `src/services/utils/{error,openapi,pagination}.ts` | `src/app/services/utils/{error,openapi,pagination}.py` |
| `src/services/utils/time.ts` | `src/app/services/utils/clock.py` (a module named `time` shadows the stdlib, ruff A005) |
| `src/services/utils/zod.ts` | `src/app/services/utils/api_model.py`: the `ApiModel` base (M4-7) |
| `src/infra/{dependency,memory,pubsub,scheduler}.ts` | `src/app/infra/{dependency,memory,pubsub,scheduler}.py` |
| none | `src/app/infra/loop.py`: `selector_loop_factory` (M4-19) |
| `src/infra/jobs/session-cleanup.ts`, `subscribers/send-welcome.ts` | `src/app/infra/jobs/session_cleanup.py`, `subscribers/send_welcome.py` |
| overlay `infra/{postgres,scripts/migrate}.ts`, `migrations/0001-init.sql` | overlay `src/app/infra/{postgres,scripts/migrate}.py`, `migrations/0001-init.sql` (with `migrations/__init__.py`) |
| overlay `services/utils/postgres-error.ts` | overlay `src/app/services/utils/postgres_error.py` |
| `tests/<path>/<name>.test.ts` | `tests/<path>/test_<name>.py`; `tests/` is a package (`__init__.py` throughout), so two `test_auth.py` files cannot clash |
| `tests/store.ts`; overlay `tests/db/setup.ts` | `tests/store.py`; overlay `tests/db/plugin.py` |
| `package.json`, `bun.lock` | `pyproject.toml`, `uv.lock`, `.python-version` |
| `tsconfig.json`, `eslint.config.mjs`, `.prettierrc` | `[tool.mypy]`, `[tool.ruff]`, `[tool.importlinter]` in `pyproject.toml`, and `lint_contracts/` (M4-10) |
| `Dockerfile`, `.dockerignore`, `.env.example`, `AGENTS.md` | the same names |

- Module and file names are snake_case, the only form an import name can take. Names never shadow
  the stdlib (ruff A005): `enum.py` becomes `enums.py`, `utils/time.py` becomes `utils/clock.py`.
- A module's routes declare its gates as dependencies and nothing else: one
  `router.add_api_route(...)` (or decorator) per endpoint naming the controller's handler, its
  status code, response model, error responses, summary and dependencies. The handler holds the
  endpoint's logic, as in bun-express.
- There is no registration list: FastAPI derives the OpenAPI paths from the mounted routers, so
  adding a module is its package, one line in `config/routes.py`, and the `contract` command.

### M4-7. Wire format

- `ApiModel` (`services/utils/api_model.py`) is the base of every request and response model:
  `alias_generator=to_camel`, validation by alias only (`validate_by_alias=True`,
  `validate_by_name=False`), serialization by alias. Attributes are snake_case in Python and
  camelCase on the wire, in both directions. Unknown keys are ignored, as zod strips them.
- `FastAPI(separate_input_output_schemas=False)`, so one component per model, not `X-Input` and
  `X-Output`.
- Component names equal bun-express's set (`ErrorBody`, `HealthResponse`, `Readiness`,
  `AuthSession`, …): the Python class name is the component name. No generic model reaches the
  contract (its component name would be `Page_X_`).
- Optional means absent, not null: a field zod declares `.optional()` is `T | None = None` in
  Python, omitted from the response when `None` (never `null`), and not nullable in the schema
  (M4-9 removes the `null` branch). A field zod declares `.nullable()` stays nullable and is always
  present. The contract audit (Validation V17) compares each component's property names, required
  set and nullability with bun-express's.
- JSON responses are `application/json; charset=utf-8`, as Express sends them.

### M4-8. Behaviour table

Both templates test every row. The Python test names it in its docstring.

| Behaviour | bun-express (as is) | python-fastapi |
| --- | --- | --- |
| Error envelope | `{error:{code,message,details?},requestId}`; `details` absent, not null, when there are none | same; built as a plain dict |
| Status per code | the `STATUS_BY_CODE` table in `utils/error.ts` | the same table in `utils/error.py` |
| Validation failure | 400 `validation_failed`, message `invalid <part>` for the first failing part in the order body, query, params; `details: [{path, message}]` with a dotted path | `RequestValidationError` mapped the same way: the first part with errors in that order (`path` is reported as `params`), its errors only, `loc` minus the part as the dotted path; pydantic's message text (Deviations) |
| Malformed JSON | 400 `validation_failed` "malformed JSON body" (body-parser) | the `json_invalid` error mapped to the same envelope |
| Non-JSON body on a JSON route | body ignored, so the body schema fails: 400 `invalid body` | 400 `invalid body`, never 415 or 422 |
| Body over 1 MB | 413 `payload_too_large` "request body is too large" | ASGI `body_limit` middleware: `Content-Length` over the limit is refused before reading, and a streamed body is counted |
| Unsupported charset | 415 `unsupported_media_type` "unsupported body charset" (a JSON charset not starting with `utf-`) | the same check in `body_limit` |
| Unknown path | 404 `not_found` "no route for METHOD path" (path without the query) | the same, from Starlette's 404 |
| Wrong method on a known path | 404, as an unknown path (Express has no 405) | Starlette's 405 mapped to the same 404 envelope |
| Trailing slash | ignored: `/api/health/` is `/api/health` (non-strict routing) | `redirect_slashes=False`: `/api/health/` is a 404 `not_found`, never a 307 (Deviations) |
| Gate order | rate limit, auth, role, then validation, as mounted | dependencies run in declaration order before body validation errors are raised: the same order |
| Unexpected error | 500 `internal` "unexpected error", stack logged once, nothing leaked | the innermost catch-all middleware turns any exception into that envelope, so the 500 still passes through the request-id and security-header middleware (an `Exception` handler on Starlette's outermost `ServerErrorMiddleware` would bypass them) |
| Request id | a well-formed incoming `x-request-id` (`^[\w.-]{8,128}$`, ASCII) is kept, otherwise a UUID; echoed in the header and the envelope | the same; the regex uses `re.ASCII` (Python's `\w` is Unicode by default) |
| Security headers | helmet 8 defaults on every response, errors included | `security_headers` sets the exact set captured from a bun-express response, recorded in the test |
| Framework headers | no `x-powered-by` | no `server` header (uvicorn `server_header=False`) |
| CORS | off unless `CORS_ORIGINS`; then the `cors` package defaults with credentials for the listed origins | Starlette `CORSMiddleware` configured to the same answers (methods GET, HEAD, PUT, PATCH, POST, DELETE; requested headers reflected; 204 preflight; credentials) only when configured |
| Client IP | `trust proxy` = `TRUST_PROXY`: false, true, a hop count, or an address, subnet or preset list (`loopback`, `linklocal`, `uniquelocal`) | the `proxy` middleware computes the client ip from `X-Forwarded-For` with the same semantics; uvicorn `proxy_headers=False` |
| Rate limit | 429 `rate_limited` with `Retry-After` = the window in seconds | the same |
| Auth cookies | `httpOnly`, `sameSite=lax`, `secure` unless development, the paths and domain from config, cleared with the same attributes | the same, from `APP_ENV` |
| Docs | none | no `/docs` or `/redoc` (`docs_url=None`, `redoc_url=None`) |
| Contract route | `GET /openapi.json` serves the document | the same |
| Request log | one line per request: `METHOD path status Nms`, path without the query, request id field | the same from `request_log` |

Starlette's `BaseHTTPMiddleware` is not used: every middleware is pure ASGI, which keeps context
variables, streaming and exception flow predictable.

### M4-9. OpenAPI shaping

`openapi.py` builds the document with FastAPI's generator and then shapes it:

- drops every `422` response and the `HTTPValidationError` and `ValidationError` components;
- registers `ErrorBody`, and adds each route's error responses from the `error_responses(...)`
  helper (`services/utils/openapi.py`), as bun-express's helper does;
- removes the `null` branch from optional, non-nullable fields (M4-7);
- drops `operationId` (bun-express's document has none) and keeps each route's `summary` and tags
  as declared;
- sets `servers: [{url: '/'}]`, the title `__PROJECT_NAME__ API`, and the version from the package
  metadata.

The document is cached on the app and served at `/openapi.json`. `tests/test_openapi.py` fails
when the committed `openapi.json` is stale, as bun-express's test does.

### M4-10. Layers

- import-linter contracts in `pyproject.toml` mirror bun-express's ESLint zones
  (`eslint.config.mjs`): `layers` and `forbidden` contracts for each zone that can be expressed
  that way.
- Module privacy (a module's `service` is imported only from inside its own module) is a custom
  contract type, `private_service`, in a `lint_contracts/` package at the package root, wired
  through `contract_types`. It runs in `lint` and reports "X imports Y, which is private to Z.
  Import Z.controller instead." `lint-imports` puts the working directory on `sys.path`, so the
  package needs no installation and stays out of the wheel (S1).
- Everything else is a review rule in `AGENTS.md`, as for bun-express.

### M4-11. Libraries

The pinned versions live in `uv.lock`. These are the choices, all verified on 3.14 by S1.

- FastAPI, pydantic v2, pydantic-settings (`env_file=".env"`, as Bun loads `.env`), uvicorn.
- argon2-cffi (argon2id; an unknown email still hashes against a dummy hash, as bun-express does),
  PyJWT (HS256), cryptography (AES-256-GCM).
- APScheduler 3.11 `AsyncIOScheduler`, created and started in `connect()`, never at import; job
  defaults `max_instances=1`, `coalesce=True`, matching croner's `protect`. mypy needs
  `[[tool.mypy.overrides]] module = ["apscheduler.*"] ignore_missing_imports = true` (no
  `py.typed`). APScheduler 4 is a prerelease.
- The logger is `services/logger.py`: bun-express's line format and its sensitive-key redaction,
  info lines quiet under tests, over stdlib `logging`.
- Tests use httpx `AsyncClient` with `ASGITransport` (its `client=` argument sets the peer
  address for proxy tests) under the anyio pytest plugin. Starlette's `TestClient` is not used:
  its portal thread runs its own event loop. time-machine moves the clock.
- `filterwarnings = ["error"]`: a warning (a deprecation, an unclosed resource) fails the suite,
  as a type error does. A targeted ignore names the warning and carries its reason on the line.

### M4-12. Postgres overlay

Driver: psycopg 3 async (`psycopg[binary,pool]`). The semantics are plan 008's (ADR 0001
amendments, v1.0.0); only the mechanism changes.

- `infra/postgres.py` is a `Resource`. `connect()` creates an `AsyncConnectionPool(open=False)` and
  opens it; `close()` closes it and forgets it. A psycopg pool cannot be reopened (S1), so the pool
  is created per connect, never at import.
- `services/db.py` exports `get_db()` and the `Executor` type (a connection or an open
  transaction). Every query takes an optional last `db` keyword. `with_transaction` lives in the
  module's `service.py`, as in bun-express.
- Migrations are `src/app/infra/migrations/NNNN-<topic>.sql`, read through
  `importlib.resources.files("app.infra.migrations")`. Each runs once, in one transaction with its
  `schema_migration` row, under the same advisory lock key. `uv_build` packages the `.sql` files
  in the wheel, and the image runs with no source tree (S1).
- `services/utils/postgres_error.py` classifies by SQLSTATE into the same codes.
- Session rotation is the same conditional update.
- `tests/store.py` exposes the `store_backed` marker, live only when the `DATABASE_URL` database
  name ends in `_test`. `reset_store()` refuses any other database.
- `testDb` loads `tests/db/plugin.py` with `-p`. The plugin:
  - points `DATABASE_URL` at `TEST_DATABASE_URL` (or the provider's test URL) in
    `pytest_load_initial_conftests`. `pytest_configure` is too late, because conftest imports the
    app first (S1);
  - migrates the test database once;
  - fails the session in `pytest_sessionfinish` when every store-backed test was skipped.

  `pythonpath = ["."]` lets plain `pytest` import `tests.db.plugin`. The plugin is not in
  `addopts`, so `check` skips the store suites.

### M4-13. The migrate service (both server templates)

- A capability manifest may declare `container: { migrate: <command> }` (python: `python -m
  app.infra.scripts.migrate`; bun-express: `bun run src/infra/scripts/migrate.ts`).
- The generator derives a `<dir>-migrate` service from the package's assembled service:
  - the same `build` (and therefore image) and the same `environment`, because the env module
    parses every production secret at import;
  - the migrate command;
  - no ports, `restart: "no"`, profile `app`;
  - `depends_on` the provider's service, `service_healthy`.
- The package service gains `depends_on: { <dir>-migrate: { condition:
  service_completed_successfully } }`.
- The clash check (`tools/lib/plan.ts`) and the rerun merge both know the derived name.
- `docker compose --profile app up --build --wait` returns 0 with the one-shot exited 0, and 1 when
  it fails (S1, Compose v5.5). The manual `migrate` command stays for local development.

### M4-14. Pins on shadowed base files

- A capability manifest holds `pins: { <base path>: <blob id> }` for every base file its overlay
  replaces. The id is git's blob id of the base file with CRLF normalised to LF, so Windows and
  Linux checkouts agree.
- `validate` fails on a shadowed file without a pin, a pin for a file the overlay does not shadow,
  and a mismatch: the base changed since the overlay was last reconciled.
- `validate --pin <template>/<kind>/<provider>` rewrites the pins and prints the base diff since
  the old pin (from git history), so the overlay author sees what to reconcile.

### M4-15. The frontend's API dev command

`__SERVER_DEV_COMMAND__` resolves to the server package's `commands.dev` in the stack. It replaces
the hard-coded `bun run dev` in `frontend/next/base/playwright.config.ts`. A lone frontend drops
the line through the existing `server` selection.

### M4-16. Compose smoke

`test-generated --with-app` runs these steps:

1. Generate throwaway production secrets in the child environment only.
2. `docker compose --profile app up --build --wait`.
3. Check `http.health` and `http.ready` from the host.
4. Always finish with `down -v`.

CI runs it on `stack-postgres` for both servers. It is the first time CI builds the images.

### M4-17. Headings check

`validate` fails when a server template's agents file lacks a heading the harness cites:
"Adding a module", "Adding the data layer", "Errors", "Tests".

### M4-18. Versions

- Catalog `v1.1.0`. The change is additive: `schemaVersion` stays 1, so the harness's supported
  version holds.
- python-fastapi 1.0.0.
- bun-express 2.2.0 (the migrate service, pins, the `stack-auth-off-postgres` case).
- frontend/next 1.1.0 (`__SERVER_DEV_COMMAND__`).

### M4-19. One event loop: SelectorEventLoop everywhere

psycopg's async mode refuses Windows' default `ProactorEventLoop`, and Python 3.14 deprecates the
event-loop policy API that used to switch it. So every loop owner passes a factory:

- `infra/loop.py` exports `selector_loop_factory()`;
- uvicorn takes `loop="app.infra.loop:selector_loop_factory"` (with and without reload; without
  it, uvicorn picks Proactor on Windows);
- the migrate script runs `asyncio.run(main(), loop_factory=selector_loop_factory)`;
- `tests/conftest.py` overrides anyio's `anyio_backend` fixture (session scope) with `("asyncio",
  {"loop_factory": selector_loop_factory})`, and marks every coroutine test for anyio.

The base uses it too, with no database, so tests and the server run on the same loop class on
every platform. A unit test asserts that the loop is a selector loop, so a regression fails by
name, not as a pool timeout. asyncpg needs none of this; it remains the fallback if psycopg's
Windows story regresses.

## Deviations from bun-express (intentional)

| Deviation | Why |
| --- | --- |
| Validation messages are pydantic's text ("String should have at least 1 character"), not zod's | paths, part names and codes match; message text is not contract |
| A compressed request body (`Content-Encoding` gzip, deflate or br) is refused with 415 "unsupported body encoding"; Express inflates it | no client in the stack compresses request bodies; refusing removes a decompression-bomb surface |
| No `ETag` on JSON responses; Express adds a weak one | no client relies on it; it would be extra code for nothing |
| A trailing slash is a 404; Express's non-strict routing serves `/api/health/` as `/api/health` | the generated client never sends one; rewriting paths before routing is the kind of hidden behaviour the template avoids, and a redirect would break `POST` |
| uvicorn's graceful shutdown (`timeout_graceful_shutdown=10`) and the lifespan replace `createShutdown`; a signal during boot ends the process before the server serves | the lifespan disconnects every resource in reverse order after uvicorn drains; bun-express's `createShutdown` tests map to lifespan tests, each recorded in the ledger |
| Environment mode is `APP_ENV`, not `NODE_ENV` | same values and semantics; `NODE_ENV` means nothing to Python tooling |
| Port 8000 | FastAPI's convention; it proves that the server port flows into the frontend |

## Amendments to ADR 0001 and conventions

- Constraints: "kebab-case files" applies to TypeScript packages; a package's file case follows its
  language and is stated in its `AGENTS.md` (snake_case for Python).
- D2: `dependencies.adapter` gains `pyproject` (M4-3). A template manifest gains
  `dropAfterPostGenerate` (M4-4); a capability manifest gains `container` (M4-13) and `pins`
  (M4-14). `tools` is checked before post-generate (M4-5).
- D4 and `conventions.md`, where the contract was TypeScript in disguise:
  - The process entry is `index` in TypeScript and `main` in Python.
  - A module's routes declare its gates (middleware in Express, dependencies in FastAPI).
    Validation comes from the schema, through the framework's own mechanism; a `validate`
    middleware is one such mechanism, not part of the contract.
  - The request flow reads "module routes → gates → controller handler".
  - The python-fastapi column of the per-language table becomes:
    - Validation and contract: pydantic, FastAPI's OpenAPI (shaped);
    - Layer enforcement: import-linter with a custom contract;
    - Gates: mypy, ruff, import-linter, pytest;
    - Env: pydantic-settings;
    - Jobs and bus: APScheduler 3, in-process bus.
- Delivery order (After v1): `server/python-fastapi` ships with the `next-python-fastapi` stack
  (milestone 4, catalog v1.1.0), before `frontend/react`. `react-python-fastapi` follows react.

## Consequences

- The catalog's machinery stops assuming npm. The next ecosystem (Maven, NuGet, Composer) adds an
  adapter value and a lockfile check, not a redesign.
- A Python project needs uv on the host. Python itself comes from uv. Bun is still needed to
  generate (ADR 0001 D6).
- Windows development has one extra rule: never run psycopg on a Proactor loop. It is encoded in
  one module with four call sites and a test.
- The harness must see through Python runners (`uv run`, `uvx`, `poetry run`) before it hosts a
  Python backend. Plan 009 does that in the same milestone.

## Status of this ADR

Proposed for G1 (plan 009). Implementation tasks P1 and later start only after Eitan approves it.
An As built section is added when the template ships.
