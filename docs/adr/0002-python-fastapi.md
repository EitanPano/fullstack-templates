# ADR 0002: server/python-fastapi, the first template outside TypeScript

Status: accepted (2026-10-23, gate G1 of plan 009)
Owner: Eitan
Plan: `fullstack-dev-harness/.plan/009-2026-10-23-python-fastapi.md` (milestone 4)
Amends: ADR 0001 (Constraints, D2, D4, Delivery order) and `docs/conventions.md`

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

`frontend/next` hard-codes `bun run dev` for its API web server. In the harness, the hooks did not
see through `uv run`, and several rules assume TypeScript idioms (kebab-case files, `.skip`).

This ADR fixes the Python template's design so that the port is mechanical. `server/bun-express`'s
tests are the executable specification: "parity" means the behaviour each of them asserts, not its
syntax. Where Python cannot or should not match, the deviation is listed here (Deviations), never
improvised.

Two pieces of evidence went into it:

- the S1 spike (2026-10-23, Windows 11 and `python:3.14-slim`) proved the risky parts before the
  ADR was written;
- an architecture review checked the draft against the installed libraries (FastAPI 0.161,
  Starlette 1.9, pydantic 2.14, uvicorn 0.54, anyio 4.15) and corrected it.

Both are in the plan's ledger.

## Decisions

The numbers follow plan 009. M4-20 to M4-22 are the harness's decisions (hooks, permissions,
language-neutral rules) and live in the plan; M4-19 and M4-23 were added here.

### M4-1. Toolchain

- **uv** manages Python, the virtual environment and the lockfile:
  - `[tool.uv] required-version = ">=0.12.23,<0.13"`. A generated project's lock is re-written on
    the host by post-generate `install`, so the host and the image must share one lock-compatible
    minor.
  - The generated Dockerfile copies uv from `ghcr.io/astral-sh/uv:0.12`.
  - The catalog's CI and release workflow pin uv exactly (0.12.23) for `validate --lockfiles`.
  - Moving to uv 0.13 is a template minor.
- **Python 3.14**, set in six places:
  - `.python-version` is `3.14`;
  - `requires-python = ">=3.14,<3.15"`;
  - ruff `target-version = "py314"`;
  - mypy `python_version = "3.14"`;
  - both Dockerfile stages use `python:3.14-slim`. They must use the same tag, because the venv's
    `python` is a symlink into the base image.

  3.15 was rejected on 2026-10-23 because the planned dependency set has no cp315 wheel for
  `pyyaml`. Moving is a template minor: those six strings and a re-lock.
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
| `typecheck` | `uv run poe typecheck` | `mypy src tests` (plus `lint_contracts` if M4-10 needs it) |
| `lint` | `uv run poe lint` | sequence `ruff check`, then `lint-imports` with `PYTHONUTF8=1` |
| `format` | `uv run poe format` | `ruff check --select I --fix`, then `ruff format` |
| `test` | `uv run poe test` | `pytest` |
| `contract` | `uv run poe contract` | `python -m app.openapi --write` writes `openapi.json` at the package root |
| `testDb` | `uv run poe test-db` | `pytest -p tests.db.plugin` (Postgres overlay) |
| `migrate` | `uv run poe migrate` | `python -m app.infra.scripts.migrate` (Postgres overlay) |

- `install` is plain `uv sync`, as `bun install` is plain for bun-express (ADR 0001 amendment R4).
  Drift is caught by `validate --lockfiles`, and the image installs with `--locked`.
- `PYTHONUTF8=1` on `lint-imports`: without it, rich's legacy Windows renderer crashes on a NUL
  stdout (S1).
- poethepoet stays the runner: uv 0.12.23 has no task runner (`uv format` and `uv check` exist, but
  neither runs named tasks).

### M4-3. Dependencies through markers

- TOML has comments, so flag- and capability-bound dependency lines and poe tasks carry markers
  in base `pyproject.toml`, exactly like source lines: `"pyjwt>=2.15",  # @auth`,
  `"psycopg[binary,pool]>=3.3",  # @database:postgres`.
- The adapter value is `pyproject`. The template-level `dependencies: { manifest, adapter }` key
  stays. For a `pyproject` template the loader refuses `flags.<f>.dependencies`, and a capability's
  `dependencies` and `scripts`, with "use markers in pyproject.toml". The `npm` adapter is
  unchanged.
- Base `uv.lock` is the superset lock: it is resolved from base `pyproject.toml`, where every
  marked line is present. Post-generate `install` re-locks after the marker pass has dropped
  lines. S1 showed that a removed dependency prunes it and its transitive-only dependencies, and
  changes no other version.
- `validate --lockfiles` dispatches per adapter: a frozen `bun install` for `npm`, `uv lock
  --check` for `pyproject` (exit 0 in sync, 1 on drift).
- CONTRIBUTING: edit `pyproject.toml` by hand, then run `uv lock`. `uv add` rewrites the line and
  can drop a trailing marker.

### M4-4. Tree hygiene

- One ignore set serves both copying and listing (`tools/lib/files.ts`). It holds `node_modules`,
  `.venv`, `__pycache__`, `.mypy_cache`, `.ruff_cache`, `.pytest_cache`, `.import_linter_cache`,
  `*.egg-info` and the existing entries, so the validate dry-run and the copier see the same tree.
- A new manifest field, `dropAfterPostGenerate`, lists paths removed from the staged package after
  post-generate and before the move (python-fastapi: `.venv` and the tool caches). Removal retries
  on `EPERM`, `EBUSY` and `EACCES`, as the move does.
- Why drop the `.venv`: a moved one is a trap. Its editable `.pth` still points at the staging
  directory, so `import app` silently loads the staged source (S1). The first `uv run` in the
  final location creates a fresh one (about 15 s cold).
- Post-generate runs with `PYTHONDONTWRITEBYTECODE=1`, so no `__pycache__` lands in the source
  tree, and the same inputs give the same tree (D6).

### M4-5. Tools preflight

When post-generate is going to run, the generator checks each planned template's `tools` before
staging:

- it resolves the program through `resolveCommand` and runs `--version`;
- it parses the first semantic version in the output and compares it with `min`;
- a failure names the tool, the version found (or "not found") and the minimum.

python-fastapi declares `{ name: uv, min: '0.12.23' }`; uv provides Python itself. uv enforces the
upper bound itself through `required-version`.

### M4-6. File mapping

| bun-express | python-fastapi |
| --- | --- |
| `src/index.ts` | `src/app/main.py`: composes the infra lifespan into `app`, runs uvicorn (M4-23) |
| `src/server.ts` | `src/app/server.py`: `create_app(lifespan=None)` and `app = create_app()`; attaches no infra, so tests never start any |
| `src/openapi.ts` | `src/app/openapi.py`: builds, shapes and caches the document (M4-9); `python -m app.openapi --write` |
| `src/config/{env,constants,cors,routes}.ts` | `src/app/config/{env,constants,cors,routes}.py`; `routes.py` exports `register_routes(app)` |
| `src/api/<m>/{routes,controller,schema,service}.ts` | `src/app/api/<m>/{routes,controller,schema,service}.py`; `routes.py` exports `router: APIRouter` |
| `src/models/<n>/{interface,type,enum,constants}.ts` | `src/app/models/<n>/{interface,type,enums,constants}.py` |
| `src/middleware/{auth,role,rate-limit}.ts` | `src/app/middleware/{auth,role,rate_limit}.py`: FastAPI dependencies (the gates) |
| `src/middleware/{request-id,request-log}.ts` | `src/app/middleware/{request_id,request_log}.py`: pure ASGI middleware |
| `helmet()`, `cors()`, `express.json({ limit })`, `trust proxy` | `src/app/middleware/{security_headers,cors,body_limit,proxy}.py`: pure ASGI middleware |
| `src/middleware/{error-handler,not-found}.ts` | `src/app/middleware/{error_handler,not_found}.py`: exception handlers plus the innermost catch-all middleware |
| `src/middleware/validate.ts` | none: FastAPI validates from the handler's signature; `error_handler.py` shapes the 400 |
| `src/middleware/express.d.ts` | `src/app/middleware/context.py`: typed accessors for `request.state` (request id, caller, client ip) |
| `src/services/{db,cache,event,logger,session}.ts` | `src/app/services/{db,cache,event,logger,session}.py` |
| `src/services/security/{cookies,crypto,jwt,otp}.ts` | `src/app/services/security/{cookies,crypto,jwt,otp}.py` |
| `src/services/communicate/index.ts` and siblings | `src/app/services/communicate/__init__.py` and `{console,mail,sms,whatsapp}.py`, `templates/{otp,password_reset,welcome}.py` |
| `src/services/utils/{error,openapi,pagination}.ts` | `src/app/services/utils/{error,openapi,pagination}.py` |
| `src/services/utils/time.ts` | `src/app/services/utils/clock.py` (a module named `time` shadows the stdlib, ruff A005) |
| `src/services/utils/zod.ts` | `src/app/services/utils/api_model.py`: the three model bases (M4-7) |
| `src/infra/{dependency,memory,pubsub,scheduler}.ts` | `src/app/infra/{dependency,memory,pubsub,scheduler}.py` |
| none | `src/app/infra/loop.py`: `selector_loop_factory` (M4-19) |
| `src/infra/jobs/session-cleanup.ts`, `subscribers/send-welcome.ts` | `src/app/infra/jobs/session_cleanup.py`, `subscribers/send_welcome.py` |
| overlay `infra/{postgres,scripts/migrate}.ts`, `migrations/0001-init.sql` | overlay `src/app/infra/{postgres,scripts/migrate}.py`, `migrations/0001-init.sql` (with `migrations/__init__.py`) |
| overlay `services/utils/postgres-error.ts` | overlay `src/app/services/utils/postgres_error.py` |
| `tests/<path>/<name>.test.ts` | `tests/<path>/test_<name>.py`; `tests/` is a package (`__init__.py` throughout), so two `test_auth.py` files cannot clash |
| `tests/store.ts`; overlay `tests/db/setup.ts` | `tests/store.py`; overlay `tests/db/plugin.py` |
| `package.json`, `bun.lock` | `pyproject.toml`, `uv.lock`, `.python-version` |
| `tsconfig.json`, `eslint.config.mjs`, `.prettierrc` | `[tool.mypy]`, `[tool.pydantic-mypy]`, `[tool.ruff]`, `[tool.importlinter]` in `pyproject.toml` |
| `Dockerfile`, `.dockerignore`, `.env.example`, `compose.yaml`, `AGENTS.md` | the same names (M4-23) |

Rules for the layout:

- **File names.** Module and file names are snake_case, the only form an import name can take.
  Names never shadow the stdlib (ruff A005): `enum.py` becomes `enums.py`, `utils/time.py`
  becomes `utils/clock.py`.
- **Routes.** A module's routes declare its gates as dependencies and nothing else. There is one
  `router.add_api_route(...)` per endpoint, naming:
  - the controller's handler;
  - the status code and response model;
  - the error responses and summary;
  - the dependencies.

  The handler holds the endpoint's logic, as in bun-express. A collection endpoint's path is `""`,
  not `"/"`: with `redirect_slashes=False`, `"/"` under the `/api/module` prefix would serve and
  document `/api/module/`.
- **No registration list.** FastAPI derives the OpenAPI paths from the mounted routers, so adding a
  module is its package, one line in `config/routes.py`, its component names in `openapi.py`
  (M4-9), and the `contract` command.

### M4-7. Wire format

**Three model bases** in `services/utils/api_model.py`. Every request and response model derives
from one of them.

| Base | Used for | Config |
| --- | --- | --- |
| `RequestModel` | request bodies | `alias_generator=to_camel`, `validate_by_alias=True`, `validate_by_name=False`, `extra="ignore"`, `strict=True` |
| `QueryModel` | query and path parameter models | as `RequestModel`, but lax (`strict=False`), because query values arrive as strings, as zod's `z.coerce` expects |
| `ResponseModel` | response bodies | `alias_generator=to_camel`, `validate_by_alias=True`, `validate_by_name=True`, `serialize_by_alias=True` |

- **Directions.** Requests accept camelCase only (snake_case keys are not aliases on the wire).
  Responses are built by attribute name in Python and never parsed from the wire; handlers return
  `ResponseModel` instances, never dicts.
- **mypy.** `[tool.pydantic-mypy] init_typed = true, init_forbid_extra = true`, so a wrong keyword
  or type when building a response is a type error. With `validate_by_name=False` on a response
  model, the pydantic plugin accepts any keyword at type-check time and the call fails at runtime.
- **Strict bodies.** A request body is strict, as zod is: `"yes"` is not a boolean and `"5"` is not
  a number. A field that should convert a string opts out with `Field(strict=False)`.

**Optionality.** zod's three forms map to pydantic's `MISSING` sentinel (pydantic 2.14):

| zod | Python | Wire |
| --- | --- | --- |
| `.optional()` | `name: str \| MISSING = MISSING` | absent allowed, `null` rejected, omitted from responses when missing; schema not nullable, not required |
| `.nullable()` | `phone: str \| None` | always present, may be `null`; schema nullable and required |
| `.nullable().optional()` | `phone: str \| None \| MISSING = MISSING` | absent keeps, `null` clears, a value sets (`UpdateMeBody.phone`); `model_fields_set` tells the cases apart |

mypy narrows `is MISSING` and flags an unguarded use.

**Values on the wire:**

- **Enums.** A wire enum is a `Literal[...]` alias, inlined in the schema as zod inlines its enums.
  A domain enum in `models/` stays an enum and is converted at the edge.
- **Timestamps.** A timestamp on the wire is a `str`, ISO 8601 UTC with millisecond precision and
  a `Z` suffix, exactly what JavaScript's `toISOString()` writes. `services/utils/clock.py`
  formats it; the schema says `format: date-time`.
- **Patterns.** Every schema pattern uses explicit ASCII classes (`[0-9]`, `[A-Za-z0-9_]`), never
  `\d` or `\w`: pydantic's regex engine is Unicode, so `^\d{6}$` accepts Arabic-Indic digits. A
  test sends them.
- **One component per model.** `FastAPI(separate_input_output_schemas=False)` gives one component
  per model, not `X-Input` and `X-Output`.

### M4-8. Behaviour table

Both templates test every row. The Python test names the row in its docstring.

**Middleware order**, outer to inner, mirroring `server.ts`:

1. `security_headers`
2. `cors`
3. `request_id`
4. `proxy`
5. `request_log`
6. `body_limit`
7. the catch-all
8. FastAPI's routing and exception handlers

`add_middleware` stacks in reverse, so `server.py` adds them inner first, and a test asserts the
resulting order. No pure middleware raises: one that refuses a request sends the envelope itself.

| Behaviour | bun-express (as is) | python-fastapi |
| --- | --- | --- |
| Error envelope | `{error:{code,message,details?},requestId}`; `details` absent, not null, when there are none | the same, built as a plain dict |
| Status per code | the `STATUS_BY_CODE` table in `utils/error.ts` | the same table in `utils/error.py`. `AppError` carries optional response `headers`, which the handler applies (`Retry-After`) |
| Validation failure | 400 `validation_failed`, message `invalid <part>` for the first failing part (body, then query, then params); `details: [{path, message}]` with a dotted path | `RequestValidationError` mapped the same way: the first part with errors in that order (`path` reported as `params`), its errors only, `loc` minus the part as the dotted path; pydantic's message text (Deviations) |
| Malformed JSON | 400 `validation_failed` "malformed JSON body" | the `json_invalid` error mapped to the same envelope |
| Non-JSON body on a JSON route | the body is ignored, so the body schema fails: 400 `invalid body` | 400 `invalid body`, never 415 or 422 |
| Body over 1 MB | 413 `payload_too_large` "request body is too large" | `body_limit` refuses a declared `Content-Length` over the limit with the envelope before reading. A streamed overflow raises a 413 subclass of Starlette's `HTTPException`, which FastAPI re-raises and the handler maps. FastAPI turns any other exception raised while reading the body into a plain 400. If the response has already started, the error is re-raised, not sent |
| Unsupported charset | 415 `unsupported_media_type` "unsupported body charset" (a JSON charset not starting with `utf-`) | the same check in `body_limit` |
| Unknown path | 404 `not_found` "no route for METHOD path" | the same, from Starlette's 404. The path is `raw_path` decoded as ASCII, never the percent-decoded `path`, so `%0A` cannot forge a log line |
| Wrong method on a known path | 404, as an unknown path (Express has no 405) | Starlette's 405 mapped to the same 404 envelope |
| Trailing slash | ignored (non-strict routing) | `redirect_slashes=False`: a 404 `not_found`, never a 307 (Deviations) |
| Gate order | rate limit, auth, role, then validation, as mounted | dependencies run in declaration order, before body validation errors are raised |
| Unexpected error | 500 `internal` "unexpected error", stack logged once, nothing leaked | the innermost catch-all middleware turns any exception into that envelope, so the 500 still passes through the request-id and security-header middleware. An `Exception` handler would sit on Starlette's outermost `ServerErrorMiddleware` and bypass them |
| Request id | a well-formed incoming `x-request-id` (`^[\w.-]{8,128}$`, ASCII) is kept, otherwise a UUID; echoed in the header and the envelope | the same with `re.fullmatch` and an ASCII class (Python's `$` matches before a trailing newline, and its `\w` is Unicode) |
| Security headers | helmet 8 defaults on every response, errors included | `security_headers` sets the exact set captured from a bun-express response, recorded in the test |
| Framework headers | no `x-powered-by` | no `server` header (uvicorn `server_header=False`) |
| CORS | off unless `CORS_ORIGINS`. Then the `cors` package defaults: methods GET, HEAD, PUT, PATCH, POST, DELETE; requested headers reflected; preflight 204 with an empty body; `Vary: Origin` (and `Access-Control-Request-Headers` on preflight); no `Max-Age`; credentials. A disallowed origin gets the same answer without `Access-Control-Allow-Origin` | `middleware/cors.py` implements exactly that. Starlette's `CORSMiddleware` answers 200, adds `Max-Age: 600` and sends a plain-text 400 to a disallowed origin |
| Client IP | `trust proxy` = `TRUST_PROXY`, through proxy-addr | `proxy` computes the client ip with proxy-addr's algorithm: see Client IP below; uvicorn `proxy_headers=False` |
| Rate limit | 429 `rate_limited` with `Retry-After` = the window in seconds | the same, through `AppError.headers` |
| Auth cookies | `httpOnly`, `sameSite=lax`, `secure` unless development, the configured paths and domain, cleared with the same attributes; token responses carry `Cache-Control: no-store` | the same, from `APP_ENV`. Attribute names are compared case-insensitively in tests (Deviations) |
| Docs | none | no `/docs` or `/redoc` (`docs_url=None`, `redoc_url=None`) |
| Contract route | `GET /openapi.json` serves the document | an explicit route serves the shaped, cached document (M4-9) |
| Request log | one line per request, `METHOD path status Nms`, path without the query, with the request id field | the same from `request_log`, using `raw_path`; uvicorn's access log is off |

**Client IP.** This is a security algorithm with no Express test to port, so the Python tests carry
a vector table. The algorithm:

1. Join every `X-Forwarded-For` header line in order with `,`, as Node does. Starlette's
   `Headers.get` returns only the first line, and a proxy that appends its own line would leave the
   attacker's entry in the trusted position.
2. Build the address list: the socket peer first, then the XFF entries reversed, each trimmed.
3. Walk the list while `trust(address, index)` holds. The client is the first untrusted address,
   or the last one if all are trusted.

What `trust` means for each `TRUST_PROXY` setting:

| Setting | Trusted |
| --- | --- |
| `false` or `0` | none |
| `true` | every address |
| `n` | index < n |
| a comma list of addresses, subnets and presets (`loopback`, `linklocal`, `uniquelocal`) | addresses matched with `ipaddress`, IPv4-mapped IPv6 normalised; a non-IP entry is never trusted |

The vector table covers:

- a spoofed XFF at 1 and 2 hops;
- two XFF lines;
- `true`;
- each preset;
- a `::ffff:` peer;
- garbage entries;
- an empty XFF.

Starlette's `BaseHTTPMiddleware` is not used: every middleware is pure ASGI, which keeps context
variables, streaming and exception flow predictable.

### M4-9. OpenAPI shaping

`openapi.py` builds the document once with FastAPI's generator, shapes it, and caches it.
`FastAPI(openapi_url=None)` turns off the built-in route, and an explicit `GET /openapi.json`
serves the cached document. No method is overridden.

The shaping steps:

- **Error responses.** Drop every `422` response and the `HTTPValidationError` and
  `ValidationError` components. Register `ErrorBody`, and add each route's error responses from
  the `error_responses(...)` helper (`services/utils/openapi.py`), as bun-express's helper does.
- **Components.** A model is a component only when its name is in `openapi.py`'s `COMPONENTS`, the
  equivalent of zod's `.openapi('Name')`. These are the bun-express names: `HealthResponse`,
  `ErrorBody`, `Readiness`, and so on. Every other `$ref` (nested models such as the error object
  or union variants) is inlined, and a cycle fails the build.
- **Operation metadata.** Drop `operationId` (bun-express's document has none),
  `requestBody.required`, and operation `description`s taken from docstrings. Keep each route's
  `summary` and tags as declared.
- **Document metadata.** Set `servers: [{url: '/'}]`, the title `__PROJECT_NAME__ API`, and the
  version from the package metadata.

`tests/test_openapi.py` fails when the committed `openapi.json` is stale, as bun-express's test
does.

### M4-10. Layers

- import-linter contracts in `pyproject.toml` mirror bun-express's ESLint zones
  (`eslint.config.mjs`): `layers` and `forbidden` contracts for each zone that can be expressed
  that way.
- **Module privacy** means a module's `service` is imported only from inside its own module.
  Standard contracts come first: an `independence` contract over `app.api.*`, with
  `ignore_imports` for imports of another module's `controller` and `schema`. It must fail a
  seeded `service` import by its contract name and pass the allowed ones.
- Only if it cannot express the rule, the custom `private_service` contract proven in S1 is used.
  It lives in a `lint_contracts/` package at the package root, wired through `contract_types`.
  `lint-imports` puts the working directory on `sys.path`, so the package needs no installation
  and stays out of the wheel.
- Everything else is a review rule in `AGENTS.md`, as for bun-express.

### M4-11. Libraries

The pinned versions live in `uv.lock`. All of these were verified on 3.14 by S1 and the review.

- **Web and env.** FastAPI, pydantic v2, plain `uvicorn` plus `watchfiles` for reload (not
  `uvicorn[standard]`, whose uvloop is never used and whose `pyyaml` has no wheel for the next
  Python).
  - No pydantic-settings and no `.env` loading. Secrets never live in a file in the working tree,
    and `BaseSettings` would merge `os.environ` into a test's explicit mapping, JSON-decode list
    fields and match names case-insensitively.
  - `config/env.py` exposes `load_env(source: Mapping[str, str]) -> LoadedEnv`. It validates a
    plain pydantic model and implements explicitly: blank as unset, development defaults,
    placeholder refusal and `defaulted_secrets`.
  - The module-level `env` is `load_env(os.environ)`.
- **Crypto.**
  - argon2-cffi for argon2id. Hashing and verifying run through `anyio.to_thread.run_sync`, since
    they take tens of milliseconds by design and would stall the loop. An unknown email still
    verifies against a dummy hash with the same parameters, on the same path.
  - PyJWT for HS256, cryptography for AES-256-GCM.
- **Scheduler.** APScheduler 3.11 `AsyncIOScheduler`:
  - created and started in `connect()`, never at import;
  - job defaults `max_instances=1` and `coalesce=True`, matching croner's `protect`;
  - mypy needs `[[tool.mypy.overrides]] module = ["apscheduler.*"] ignore_missing_imports = true`
    (no `py.typed`).

  APScheduler 4 is a prerelease.
- **Time.** Every expiry and window (rate limits, memory-store TTLs, OTP, session grace) reads wall
  time through `services/utils/clock.py`, never `time.monotonic()`, which time-machine does not
  move. Durations for logs may use `time.perf_counter()`.
- **Logging.** `services/logger.py` keeps bun-express's line format and its sensitive-key
  redaction, with info lines quiet under tests. It configures the root logger, so uvicorn's own
  records come out in the same format.
- **Tests.**
  - httpx `AsyncClient` with `ASGITransport` (its `client=` argument sets the peer for proxy tests;
    `base_url="https://testserver"` so Secure cookies are sent), under the anyio pytest plugin with
    `anyio_mode = "auto"`.
  - Starlette's `TestClient` is not used: its portal thread runs its own event loop.
  - time-machine moves the clock.
- **Warnings.** `filterwarnings = ["error"]`: a warning (a deprecation, an unclosed resource) fails
  the suite, as a type error does. A targeted ignore names the warning and carries its reason on
  the line; Windows selector loops are expected to need a few.

### M4-12. Postgres overlay

Driver: psycopg 3 async (`psycopg[binary,pool]`). The semantics are plan 008's (ADR 0001
amendments, v1.0.0); only the mechanism changes.

- **The resource.** `infra/postgres.py` is a `Resource` whose pool is built on first use (by
  `connect()` or by `get_db()`), behind an `asyncio.Lock`, as bun-express builds its client on
  demand. `close()` closes the pool and forgets it, so the next use builds a new one: a psycopg
  pool cannot be reopened (S1). Nothing does I/O at import. A pool is never reused across event
  loops; in tests a session-scoped async fixture owns it.
- **The db seam.** `services/db.py` exports `get_db()` and the `Executor` type (a connection or an
  open transaction). Every query takes an optional last `db` keyword. `with_transaction` lives in
  the module's `service.py`, as in bun-express.
- **Migrations.** They live in `src/app/infra/migrations/NNNN-<topic>.sql`.
  `migrate(directory: Traversable = files("app.infra.migrations"))` takes the directory as a
  parameter, so tests pass a temporary one. Each file runs once, in one transaction with its
  `schema_migration` row, under the same advisory lock key. `uv_build` packages the `.sql` files
  into the wheel, and the image runs with no source tree (S1).
- **Error classification.** `services/utils/postgres_error.py` classifies by SQLSTATE into the
  same codes. A connection failure has no SQLSTATE: `psycopg.OperationalError` without one, and
  `psycopg_pool.PoolTimeout` and `PoolClosed`, map to `upstream_unavailable`.
- **Sessions.** Session rotation is the same conditional update.
- **The store seam.** `tests/store.py` exposes the `store_backed` marker, live only when the
  `DATABASE_URL` database name ends in `_test`. `reset_store()` refuses any other database.
- **The test plugin.** `testDb` loads `tests/db/plugin.py` with `-p`. The plugin:
  - points `DATABASE_URL` at `TEST_DATABASE_URL` (or the provider's test URL) in
    `pytest_load_initial_conftests`. `pytest_configure` is too late, because conftest imports the
    app first (S1);
  - migrates the test database once;
  - fails the session in `pytest_sessionfinish` when every store-backed test was skipped.

  `pythonpath = ["."]` lets plain `pytest` import `tests.db.plugin`. The plugin is not in
  `addopts`, so `check` skips the store suites.

### M4-13. The migrate service (both server templates)

- A capability manifest may declare `container: { migrate: <command> }`:
  - python: `python -m app.infra.scripts.migrate`;
  - bun-express: `bun run src/infra/scripts/migrate.ts`.
- The generator derives a `<dir>-migrate` service from the package's assembled service:
  - the same `build` context (Compose builds it per service, from shared cached layers);
  - the same `environment`, because the env module parses every production secret at import;
  - the migrate command;
  - no ports, `restart: "no"`, profile `app`;
  - `depends_on` the provider's service with `service_healthy`.
- The package service gains `depends_on: { <dir>-migrate: { condition:
  service_completed_successfully } }`.
- The clash check (`tools/lib/plan.ts`) and the rerun merge both know the derived name.
- `docker compose --profile app up --build --wait` returns 0 when the one-shot exits 0, and 1 when
  it fails (S1, Compose v5.5).
- The manual `migrate` command stays for local development.
- Follow-up, not in v1.1.0: a narrow env reader for migrate in both templates, so that `docker
  compose run <dir>-migrate` does not need every production secret.

### M4-14. Pins on shadowed base files

- A capability manifest holds `pins: { <base path>: <blob id> }` for every base file its overlay
  replaces. The id is git's blob id of the base file with CRLF normalised to LF, so Windows and
  Linux checkouts agree.
- `validate` fails on:
  - a shadowed file without a pin;
  - a pin for a file the overlay does not shadow;
  - a mismatch, meaning the base changed since the overlay was last reconciled.
- `validate --pin <template>/<kind>/<provider>` rewrites the pins and prints the base diff since
  the old pin (from git history), so the overlay author sees what to reconcile.

### M4-15. The frontend's API dev command

`__SERVER_DEV_COMMAND__` resolves to the server package's `commands.dev` in the stack. It replaces
the hard-coded `bun run dev` in `frontend/next/base/playwright.config.ts`. A lone frontend falls
back to `bun run dev`, the command of its default paired server, as `__SERVER_DIR__` and
`__SERVER_PORT__` already fall back to that server's directory and port.

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
- bun-express 2.2.0: the migrate service, pins, and the `stack-auth-off-postgres` case.
- frontend/next 1.1.0: `__SERVER_DEV_COMMAND__`.

### M4-19. One event loop: SelectorEventLoop everywhere

psycopg's async mode refuses Windows' default `ProactorEventLoop`, and Python 3.14 deprecates the
event-loop policy API that used to switch it. So every loop owner passes a factory:

- `infra/loop.py` exports `selector_loop_factory()`;
- uvicorn takes `loop="app.infra.loop:selector_loop_factory"`, with and without reload (without
  reload, uvicorn picks Proactor on Windows);
- the migrate script runs `asyncio.run(main(), loop_factory=selector_loop_factory)`;
- `tests/conftest.py` overrides anyio's `anyio_backend` fixture (session scope) with `("asyncio",
  {"loop_factory": selector_loop_factory})`.

Further rules:

- The base uses the factory too, with no database, so tests and the server run on the same loop
  class on every platform.
- A unit test asserts that the loop is a selector loop, so a regression fails by name, not as a
  pool timeout.
- Windows' selector loop cannot run asyncio subprocesses. A test that spawns a process (the entry
  tests) is a synchronous test using `subprocess.run`.
- asyncpg needs none of this; it remains the fallback if psycopg's Windows story regresses.

### M4-23. The entry, the image and Compose

Tests never start uvicorn, so this is where production can silently diverge. It is written down in
full.

- **`main.py`** composes the infra lifespan into `app` (`app.main:app`).
  - On startup the lifespan logs the defaulted-secret warnings once, connects every resource and
    logs `listening`. On shutdown it disconnects in reverse order.
  - `main()` calls `uvicorn.run` with the app object, or, with `--reload`, with the import string
    `"app.main:app"`, `reload=True` and `reload_dirs=["src"]`.
  - Both calls set:
    - `host="0.0.0.0"` and `port=env.port`;
    - `loop="app.infra.loop:selector_loop_factory"`;
    - `server_header=False`, `proxy_headers=False`, `access_log=False`;
    - `log_config=None`;
    - `timeout_graceful_shutdown=10`.

    uvicorn's access log would log the query string, which bun-express deliberately never does.
- **Dockerfile.** Two stages on `python:3.14-slim`, uv copied from `ghcr.io/astral-sh/uv:0.12`.
  - The builder sets `UV_PYTHON_DOWNLOADS=never`, `UV_LINK_MODE=copy` and
    `UV_COMPILE_BYTECODE=1`.
  - It runs `uv sync --locked --no-dev --no-install-project` on `pyproject.toml`, `uv.lock` and
    `.python-version` first, then copies `src` and runs `uv sync --locked --no-dev
    --no-editable`. Dependencies are a cached layer.
  - The runtime stage copies only `/app/.venv` (same path) and sets `ENV
    PATH="/app/.venv/bin:$PATH"`, `ENV APP_ENV=production` and `ENV PORT=8000`.
  - It runs as a non-root user, exposes 8000, and starts with `CMD ["python", "-m", "app.main"]`
    in exec form.
- **`compose.yaml`** mirrors bun-express's fragment:
  - `APP_ENV: production`;
  - `PORT: "__PORT__"`;
  - the same secret lines (`${VAR}`, no default);
  - `TRUST_PROXY: ${TRUST_PROXY:-1}`;
  - `CORS_ORIGINS`, `JOBS_ENABLED`;
  - `ports: ["127.0.0.1:__PORT__:__PORT__"]` on loopback only. With `TRUST_PROXY=1`, publishing on
    every interface would let any caller choose its IP and bypass the per-IP login and OTP limits;
  - profile `app`.

## Implementation notes (binding)

1. **`APP_ENV=test`** is set at the top of `tests/conftest.py`, before any `app` import (one `E402`
   exemption with its reason). Bun sets `NODE_ENV=test` implicitly; pytest does not.
2. **Cookies and headers.** A handler that sets cookies or `Cache-Control` declares a `response:
   Response` parameter. Handlers declare no `Header` or `Cookie` parameters: tokens are read through
   `services/security/cookies.py`, so the validation mapper only deals with body, query and path.
3. **Body-keyed rate limits.** `by_body_string` and `by_body_path` read `await request.body()`
   (cached by Starlette) and parse it defensively. A non-JSON or non-object body yields `None`,
   never an exception.
4. **Pagination.** A generic `Page[T]` with concrete subclasses (`class ModulePage(Page[Module])`).
   The component is `ModulePage`, and no generic name reaches the contract.
5. **Lint rules.** ruff `select = ["E", "F", "W", "I", "B", "UP", "A", "N", "ASYNC", "S", "DTZ",
   "RUF", "SIM", "PT", "ANN"]`, line length 100.
6. **Type rules.** mypy `strict` with the pydantic plugin, `init_typed`, `init_forbid_extra`, and
   `disallow_any_explicit = true`. With ruff `ANN401` that enforces "no `Any`". A `# type:
   ignore[code]` carries its reason on the line.
7. **The manifest.** Sketch of `template.yaml`:

   ```yaml
   schemaVersion: 1
   id: python-fastapi
   kind: server
   name: FastAPI on Python 3.14
   version: 1.0.0
   runtime: { language: python, platform: cpython, minVersion: '3.14' }
   tools:
     - { name: uv, min: '0.12.23' }
   placeholders: [PROJECT_NAME]
   flags:
     auth: { summary: …, default: true, onlyPaths: [ … ] }   # no dependencies: markers (M4-3)
   capabilities:
     database: { providers: [postgres] }
     cache: { providers: [] }
     messaging: { providers: [], mode: push }
   dependencies: { manifest: pyproject.toml, adapter: pyproject }
   commands: { install: uv sync, dev: uv run poe dev, check: uv run poe check, … }   # M4-2
   contract: { produces: openapi.json }
   http: { port: 8000, health: /api/health, ready: /api/health/ready }
   gitignore: [python]
   agents: AGENTS.md
   defaultStack: next-python-fastapi
   postGenerate: [install, contract, format]
   dropAfterPostGenerate: [.venv, .mypy_cache, .ruff_cache, .pytest_cache, .import_linter_cache]
   ```

   Cases: `default`, `auth-off`, `stack`, `stack-auth-off`, `postgres`, `auth-off-postgres`,
   `stack-postgres`, `stack-auth-off-postgres`.

## Deviations from bun-express (intentional)

| Deviation | Why |
| --- | --- |
| Validation messages are pydantic's text ("String should have at least 1 character"), not zod's | codes, statuses, part names and paths match; message text is not contract |
| A discriminated union's error path includes the tag (`target.phone.value`; zod reports `target.value`) | pydantic puts the tag in `loc`; no client or test reads that path, and stripping it would need a schema walk in the mapper |
| Malformed JSON is a 400 only on routes that take a body; Express parses every JSON request, including unknown paths | FastAPI reads the body only for routes with a body parameter; a route without one ignores it |
| Top-level scalar JSON (`"x"`, `5`) is 400 `invalid body`; body-parser's strict mode says "malformed JSON body" | same status and code |
| An optional body sent as non-JSON (`RefreshBody` as `text/plain`) is 400 `invalid body`; Express ignores it | a client sending the wrong content type is told so |
| `OPTIONS` with CORS off is a 404; Express answers 200 with `Allow` | nothing calls it; CORS-on preflights match exactly |
| A compressed request body (`Content-Encoding` gzip, deflate or br) is 415 "unsupported body encoding"; Express inflates it | no client in the stack compresses request bodies; refusing removes a decompression-bomb surface |
| No `ETag` on JSON responses; Express adds a weak one | no client relies on it |
| JSON responses are `application/json` without `; charset=utf-8` | JSON is UTF-8 by definition (RFC 8259); no test asserts the parameter |
| A trailing slash is a 404; Express's non-strict routing serves `/api/health/` as `/api/health` | the generated client never sends one; rewriting paths before routing is hidden behaviour, and a redirect would break `POST` |
| Cookie attributes come out as `expires=` and `SameSite=lax` (Python's `http.cookies`); Express writes `Expires=` and `SameSite=Lax` | attribute names and these values are case-insensitive (RFC 6265); tests compare them case-insensitively |
| A failed bind or a failed startup exits with code 3 and uvicorn's message (`[Errno 98] … address already in use`); bun-express exits 1 with `listen failed port=N` | uvicorn owns the process; the entry test asserts non-zero, a message naming the port, and no `listening` line |
| A signal during startup is held until startup ends: uvicorn's handler only sets a flag, and the lifespan's `connect_all` (up to about 35 s of retries) runs to completion or failure, so `docker stop` may reach its SIGKILL; bun-express exits at once | the lifespan still disconnects in reverse order on every normal shutdown; making boot cancellable would mean replacing uvicorn's signal handling |
| Environment mode is `APP_ENV`, not `NODE_ENV` | the same values and semantics; `NODE_ENV` means nothing to Python tooling |
| Port 8000 | FastAPI's convention; it proves that the server port flows into the frontend |

## Amendments to ADR 0001 and conventions

- **Constraints:** "kebab-case files" applies to TypeScript packages. A package's file case follows
  its language and is stated in its `AGENTS.md` (snake_case for Python).
- **D2:**
  - `dependencies.adapter` gains `pyproject` (M4-3);
  - a template manifest gains `dropAfterPostGenerate` (M4-4);
  - a capability manifest gains `container` (M4-13) and `pins` (M4-14);
  - `tools` is checked before post-generate (M4-5).
- **D4 and `conventions.md`**, where the contract was TypeScript in disguise:
  - the process entry is `index` in TypeScript and `main` in Python;
  - a module's routes declare its gates (middleware in Express, dependencies in FastAPI);
    validation comes from the schema, through the framework's own mechanism;
  - the request flow reads "module routes → gates → controller handler";
  - the python-fastapi column of the per-language table: pydantic with FastAPI's OpenAPI (shaped);
    import-linter; mypy, ruff, import-linter, pytest; a pydantic model over the environment;
    APScheduler 3 and the in-process bus.
- **Delivery order (After v1):** `server/python-fastapi` ships with the `next-python-fastapi` stack
  (milestone 4, catalog v1.1.0), before `frontend/react`; `react-python-fastapi` follows react.

## Consequences

- The catalog's machinery stops assuming npm. The next ecosystem (Maven, NuGet, Composer) adds an
  adapter value and a lockfile check, not a redesign.
- A Python project needs uv on the host; Python itself comes from uv. Bun is still needed to
  generate (ADR 0001 D6).
- Windows development has one extra rule: never run psycopg on a Proactor loop. It is encoded in
  one module, with four call sites and a test.
- The harness must see through Python runners (`uv run`, `uvx`, `poetry run`) before it hosts a
  Python backend. Plan 009 does that in the same milestone.

## Status of this ADR

Accepted by Eitan at G1 (2026-10-23); T1 and later build against it.
An As built section is added when the template ships.
