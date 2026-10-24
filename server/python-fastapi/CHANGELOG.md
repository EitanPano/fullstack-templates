# Changelog

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
