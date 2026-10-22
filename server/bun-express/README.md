# server/bun-express

Express 5 on Bun: a layered API with zod schemas, an OpenAPI contract generated from them,
authentication (accounts, sessions, JWT, OTP), scheduled jobs and an in-process event bus.
Generated alone or as the `server` of the `next-bun-express` stack.

## Layout

- `template.yaml`: the manifest (flags, commands, contract, HTTP surface).
- `base/`: the files copied into the generated package, including `AGENTS.md` and `bun.lock`.
- `compose.yaml`: the Compose service body, keyed by the package directory at generation.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `auth-off`).
- `CHANGELOG.md`: version history.

## Commands

| Intent | Command |
| --- | --- |
| install | `bun install` |
| dev | `bun run dev` |
| check | `bun run check` |
| typecheck | `bun run typecheck` |
| lint | `bun run lint` |
| format | `bun run format` |
| test | `bun test` |
| contract | `bun run openapi` |

## Flags

- `auth` (default on): accounts, sessions, JWT and OTP. Off removes the `auth` and `user`
  modules, their middleware, models, jobs, tests and the `cookie-parser` and `jose`
  dependencies; every endpoint is then public.

The layer map and conventions of the generated package are in `base/AGENTS.md`.
