# Capabilities and providers

A capability is something a project can have in more than one implementation: a database,
a cache, a message broker. A **provider** is one implementation, described once for every
language. A **capability overlay** is how one template binds one provider. This is
section D3 of [ADR 0001](adr/0001-catalog-architecture.md), expanded.

Status: none shipped yet; `database/postgres` for `bun-express` is milestone 3. Until the
first overlay lands, the generator refuses `--capability` with "no provider overlays exist
in this catalog yet", and the shapes below are the design the overlay will be built to.

## Provider manifest

`shared/providers/<kind>/<name>/provider.yaml` holds a Compose service fragment, an env
contract and init files, and knows nothing about a language.

```yaml
schemaVersion: 1
kind: database
id: postgres
name: PostgreSQL 17
compose: compose.yaml               # service `database`, healthcheck, volume
env:
  - name: DATABASE_URL
    local: postgres://app:app@localhost:5432/app      # outside production
    compose: postgres://app:app@database:5432/app     # inside the compose network
    test: postgres://app:app@localhost:5432/app_test
files: [db/init.sql]                # copied to the project root; creates app_test
```

## Capability overlay

`<template>/capabilities/<kind>/<provider>/` holds the files that replace or join `base/`
(the engine's infra file, the rewritten db seam and repositories, the migration script,
the test-database helpers), the dependencies to add, and the marker name it turns on. Its
manifest has this shape:

```yaml
schemaVersion: 1
kind: database
provider: postgres
dependencies: { add: { … } }
commands: { testDb: bun run test:db, migrate: bun run db:migrate }   # merged into the manifest's
```

Selecting `database: postgres` for `server/bun-express` copies the overlay over `base/`,
applies `@database` and `@database:postgres` markers, adds the dependencies, appends the
provider's env entries to the package's `.env.example` and to its Compose service, adds the
provider's service to the root Compose file, copies `db/init.sql`, and adds `testDb` and
`migrate` to the recorded commands. Selecting no database leaves the in-memory store, so
the harness's data-layer task still applies later. Both paths are kept valid on purpose.

## Selection pipeline

Overlays and flags compose in a fixed order:

1. Copy `base/`.
2. Copy every selected overlay over it.
3. Apply flags: remove `onlyPaths`, run the marker pass, apply dependency changes.

A flag's `onlyPaths` therefore also removes overlay files at those paths: the postgres
overlay ships its `user` repository and `session` rewrite, and `auth=false` drops them.
Every template's `tests/cases.yaml` covers each flag alone, each capability alone, and
each capability with every flag off. The README matrix lists only tested combinations.

## Database

For a server: a `Resource` connected at boot, pinged by readiness and closed on shutdown;
one repository per module; a separate test database; migrations or indexes shipped with the
change that needs them. For a worker: the same client, no HTTP. These are the harness's
`database` skill rules, made language-neutral; the language specifics live in the overlay
and the template's `AGENTS.md`.

## Cache

Typed `get`; `set` with a TTL; `del`; atomic `incr` that applies the TTL on the first
write.

## Messaging

Push mode (a server): the server publishes events, delivery is at-least-once, and a
subscriber is idempotent. Pull mode (a worker): the worker consumes, acknowledges after
success, and dead-letters a message after N attempts. A template declares which mode it
speaks in its manifest.
