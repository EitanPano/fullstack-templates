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
  `postgres`, `auth-off-postgres`, `sdk`, and the stack cases).
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
  entities, their middleware, models, jobs, tests and the `cookie-parser` and `jose`
  dependencies; every endpoint is then public.

## With an SDK

When the plan holds an `sdk` package ([ADR 0020](../../docs/adr/0020-sdk-kind.md); generate with
`--sdk <dir>=<template>`), the server also serves it. Without one none of this exists in the
generated package.

- `/api/sdk/v1/`: the public, cross-origin namespace, `api/sdk/<entity>/`. One gate runs first:
  CORS for the namespace alone (the origin is echoed once the key step admits the request; never
  credentials), the `X-Sdk-Key` key (`services/security/sdk-keys.ts`, async, answering from a cache,
  misses too; a switched-off key gets `{ enabled: false }` from a GET or HEAD of `config` and 403
  elsewhere), then a rate limit by key and by address (a preflight is counted before any lookup),
  then a JSON body of at most 64 KB, read after the gate. `GET /api/sdk/v1/config` answers `{ enabled }`, the kill switch. `POST /api/sdk/v1/telemetry`
  takes the frame's events (frame only, 204) and awaits `services/telemetry.ts` with them.
- `GET|HEAD /api/sdk/dist/v<major>/<file>.js` and `<file>.css`: the SDK's build, with no key and a five-minute cache.
- `GET /api/sdk/frame/v<major>?k=<key>`: the frame document, framed only by the key's origins, with
  its own script, style and image policy.
- Variables: `SDK_KEYS` (`key=origin,origin;key=origin`; unset refuses every request),
  `SDK_ENABLED` (default `true`), `SDK_IMG_ORIGINS` (image origins the frame may load; default none),
  `SDK_DIR` (the build to serve; the image sets it).
- Compose takes the build through an `additional_contexts` line for the SDK's build-only service,
  in both deploy modes (Compose 2.35.0 or later).

## Capabilities

- `database/postgres`: records, users and sessions in Postgres through Bun's built-in `SQL`
  client (no driver dependency). Generate with `--capability database=postgres`. The overlay
  replaces `services/db.ts` and each entity's `service.ts`, adds `infra/postgres.ts`,
  `infra/migrations/` and the migrate script, and the root `docker-compose.yml` gets the
  `database` service. Two commands are added:

  | Intent | Command |
  | --- | --- |
  | migrate | `bun run db:migrate` |
  | testDb | `bun run test:db` |

  `DATABASE_URL` is required in production and has no default in Compose, so export it before
  `docker compose --profile app up`. The server does not migrate on boot: in Compose the one-shot
  `backend-migrate` service (app profile) applies the migrations, and the backend waits for it,
  so `docker compose --profile app up --build` migrates before the backend starts and the
  backend does not start if the migrations fail. `docker compose --profile app run --rm
  backend-migrate` runs it alone and needs the same exported secrets. `bun run db:migrate`
  stays for local development; elsewhere the deploy pipeline runs it.
  `check` skips the store-backed suites and needs no Docker; `test:db` runs everything against the `app_test` database of the same service
  (`docker compose up -d --wait database` first).

The layer map and conventions of the generated package are in `base/AGENTS.md`.
