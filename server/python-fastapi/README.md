# server/python-fastapi

FastAPI on Python 3.14, managed by uv: a layered API with pydantic models, an OpenAPI contract
generated from them (shaped to the document `server/bun-express` writes), authentication (accounts,
sessions, JWT, OTP), scheduled jobs, an in-process event bus and a Postgres capability. It is the second server template
and stays at behavioural parity with `server/bun-express`; the design is
[ADR 0002](../../docs/adr/0002-python-fastapi.md). Generated alone or as the `server` of the
`next-python-fastapi` stack.

## Layout

- `template.yaml`: the manifest (flags, commands, contract, HTTP surface).
- `base/`: the files copied into the generated package, including `AGENTS.md`, `pyproject.toml`
  and `uv.lock`.
- `capabilities/database/postgres/`: the Postgres overlay (manifest and `overlay/` files).
- `compose.yaml`: the Compose service body, keyed by the package directory at generation.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `auth-off`, `stack`,
  `stack-auth-off`, `postgres`, `auth-off-postgres`, `stack-postgres` and
  `stack-auth-off-postgres`).
- `CHANGELOG.md`: version history.

## Run it

```
uv sync
uv run poe dev
uv run poe check
uv run poe contract
```

`uv sync` installs the locked dependencies (uv installs Python 3.14 itself), `dev` serves the API
on port 8000 with reload, `check` runs every gate, and `contract` writes `openapi.json`.

## Commands

| Intent | Command |
| --- | --- |
| install | `uv sync` |
| dev | `uv run python -m app.main --reload` (`uv run poe dev` is the same) |
| check | `uv run poe check` |
| typecheck | `uv run poe typecheck` |
| lint | `uv run poe lint` |
| format | `uv run poe format` |
| test | `uv run poe test` |
| contract | `uv run poe contract` |

`uv run poe check` runs `lint` (ruff, then import-linter), the format check, `typecheck` (mypy
strict) and `test` (pytest), stopping at the first failure; it needs no Docker. poethepoet is a
dev dependency; the image never uses it.

## Flags

- `auth` (default on): accounts, sessions, JWT and OTP. Off removes the `auth` and `user`
  modules, their middleware, models, jobs, subscribers and tests and the `pyjwt` dependency;
  every endpoint is then public.

## Capabilities

- `database/postgres`: records, users and sessions in Postgres through psycopg 3 and its async
  connection pool (`psycopg[binary,pool]`). Generate with `--capability database=postgres`. The
  overlay replaces `services/db.py` and each module's `service.py` (and `services/session.py` with
  `auth`), adds `infra/postgres.py`, `infra/migrations/` and the migrate script, and the root
  `docker-compose.yml` gets the `database` service. Two commands are added:

  | Intent | Command |
  | --- | --- |
  | migrate | `uv run poe migrate` |
  | testDb | `uv run poe test-db` |

  `DATABASE_URL` is required in production and has no default in Compose, so export it before
  `docker compose --profile app up`. The server does not migrate on boot: in Compose the one-shot
  `backend-migrate` service (app profile) applies the migrations from the backend's image, and the
  backend waits for it, so `docker compose --profile app up --build` migrates before the backend
  starts and the backend does not start if the migrations fail. `docker compose --profile app run
  --rm backend-migrate` runs it alone and needs the same exported secrets. `uv run poe migrate`
  stays for local development; elsewhere the deploy pipeline runs the migrations.
  `check` skips the store-backed suites and needs no Docker; `test-db` runs everything against the
  `app_test` database of the same service (`docker compose up -d --wait database` first). psycopg
  refuses Windows' default event loop, so the migrate script, the tests and uvicorn all run on
  `infra/loop.py`'s selector loop. The development and test URLs default to `127.0.0.1`, not
  `localhost`: the service publishes on IPv4 loopback only, and on Windows `localhost` resolves to
  `::1` first, where nothing answers, so every new connection would wait two seconds.

## Cases

`tests/cases.yaml` lists the variants the catalog generates and gates: `default`, `auth-off`,
`stack` (`next-python-fastapi`), `stack-auth-off`, `postgres`, `auth-off-postgres`,
`stack-postgres` (also built and smoke-tested in Compose) and `stack-auth-off-postgres`.

## Requirements

uv 0.12.23 or newer and below 0.14 (so 0.12 and 0.13), which installs Python 3.14. The Docker
image is built from `python:3.14-slim` with uv copied from `ghcr.io/astral-sh/uv:0.13`.

## Editing `pyproject.toml`

Edit it by hand, then run `uv lock`. `uv add` rewrites the line and can drop a trailing marker.
The base `uv.lock` is resolved from the base `pyproject.toml`, where every marked line is present;
the generated project re-locks after the marker pass.

The layer map and conventions of the generated package are in `base/AGENTS.md`.
