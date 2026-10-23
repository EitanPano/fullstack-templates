# server/python-fastapi

FastAPI on Python 3.14, managed by uv: a layered API with pydantic models, an OpenAPI contract
generated from them (shaped to the document `server/bun-express` writes), one error envelope, a
request id on every response, and health and readiness endpoints. It is the second server template
and must stay at behavioural parity with `server/bun-express`; the design is
[ADR 0002](../../docs/adr/0002-python-fastapi.md). Generated alone or as the `server` of the
`next-python-fastapi` stack.

This is the second slice of the template: the skeleton, the entry and the core middleware, the
reference module, the in-process store, bus and scheduler, pagination and the rate limiter.
Authentication and the Postgres overlay follow in later versions of the same 1.0.0 release.

## Layout

- `template.yaml`: the manifest (commands, contract, HTTP surface).
- `base/`: the files copied into the generated package, including `AGENTS.md`, `pyproject.toml`
  and `uv.lock`.
- `compose.yaml`: the Compose service body, keyed by the package directory at generation.
- `tests/cases.yaml`: the generated variants the catalog gates (`default` and `stack`).
- `CHANGELOG.md`: version history.

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

`uv run poe check` runs `lint` (ruff, then import-linter), `format-check`, `typecheck` (mypy
strict) and `test` (pytest), stopping at the first failure. poethepoet is a dev dependency; the
image never uses it.

## Editing `pyproject.toml`

Edit it by hand, then run `uv lock`. `uv add` rewrites the line and can drop a trailing marker.
The base `uv.lock` is resolved from the base `pyproject.toml`, where every marked line is present;
the generated project re-locks after the marker pass.

The layer map and conventions of the generated package are in `base/AGENTS.md`.
