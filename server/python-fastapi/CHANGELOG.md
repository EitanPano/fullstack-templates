# Changelog

## 1.0.0 — unreleased

- First version: FastAPI on Python 3.14, managed by uv (uv 0.12, which installs Python 3.14), at
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
- One event loop class everywhere: `infra/loop.py` gives the selector loop that uvicorn and the
  tests use.
- `AGENTS.md` carries the agent-facing sections the harness cites: Adding a module, Adding the
  data layer, Errors and Tests.
- Deviations from bun-express, each intentional: validation message text is pydantic's; a string
  length counts code points; a trailing slash is a 404; a compressed request body is a 415; no
  `ETag`; `APP_ENV` replaces `NODE_ENV`; the default port is 8000; a failed bind exits with
  uvicorn's code.
