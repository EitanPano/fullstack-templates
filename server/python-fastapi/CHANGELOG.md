# Changelog

## 1.0.0 — 2026-10-23

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
