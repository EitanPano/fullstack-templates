# server/bun-express

Express 5 on Bun: a layered API with zod schemas, an OpenAPI contract generated from them,
authentication (accounts, sessions, JWT, OTP), scheduled jobs and an in-process event bus.
Generated alone or as the `server` of the `next-bun-express` stack.

## Layout

- `template.yaml`: the manifest (flags, commands, contract, HTTP surface).
- `base/`: the files copied into the generated package, including `AGENTS.md` and `bun.lock`.
- `capabilities/database/postgres/`: the Postgres overlay (manifest and `overlay/` files).
- `compose.yaml`: the Compose service body, keyed by the package directory at generation.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `auth-off`,
  `postgres`, `auth-off-postgres`, and the stack cases).
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

## Capabilities

- `database/postgres`: records, users and sessions in Postgres through Bun's built-in `SQL`
  client (no driver dependency). Generate with `--capability database=postgres`. The overlay
  replaces `services/db.ts` and each module's `service.ts`, adds `infra/postgres.ts`,
  `infra/migrations/` and the migrate script, and the root `docker-compose.yml` gets the
  `database` service. Two commands are added:

  | Intent | Command |
  | --- | --- |
  | migrate | `bun run db:migrate` |
  | testDb | `bun run test:db` |

  `DATABASE_URL` is required in production. `check` skips the store-backed suites and needs
  no Docker; `test:db` runs everything against the `app_test` database of the same service
  (`docker compose up -d database` first).

The layer map and conventions of the generated package are in `base/AGENTS.md`.
