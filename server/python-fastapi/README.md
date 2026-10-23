# server/python-fastapi

FastAPI on Python 3.14, managed by uv: a layered API with pydantic models, an OpenAPI contract
generated from them (shaped to the document `server/bun-express` writes), authentication (accounts,
sessions, JWT, OTP), scheduled jobs and an in-process event bus. It is the second server template
and stays at behavioural parity with `server/bun-express`; the design is
[ADR 0002](../../docs/adr/0002-python-fastapi.md). Generated alone or as the `server` of the
`next-python-fastapi` stack.

## Layout

- `template.yaml`: the manifest (flags, commands, contract, HTTP surface).
- `base/`: the files copied into the generated package, including `AGENTS.md`, `pyproject.toml`
  and `uv.lock`.
- `compose.yaml`: the Compose service body, keyed by the package directory at generation.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `auth-off`, `stack`
  and `stack-auth-off`).
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
| dev | `uv run poe dev` |
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

## Cases

`tests/cases.yaml` lists the variants the catalog generates and gates: `default`, `auth-off`,
`stack` (`next-python-fastapi`) and `stack-auth-off`.

## Requirements

uv 0.12 (0.12.23 or newer), which installs Python 3.14. The Docker image is built from
`python:3.14-slim` with uv copied from `ghcr.io/astral-sh/uv:0.12`.

## Editing `pyproject.toml`

Edit it by hand, then run `uv lock`. `uv add` rewrites the line and can drop a trailing marker.
The base `uv.lock` is resolved from the base `pyproject.toml`, where every marked line is present;
the generated project re-locks after the marker pass.

The layer map and conventions of the generated package are in `base/AGENTS.md`.
