# Capabilities and providers

A capability is something a project can have in more than one implementation: a database,
a cache, a message broker. A **provider** is one implementation, described once for every
language. A **capability overlay** is how one template binds one provider. This is
section D3 of [ADR 0001](adr/0001-catalog-architecture.md), expanded.

Status: `database/postgres` for `bun-express` shipped in v1.0.0 and for `python-fastapi` in
v1.1.0, which also added the migrate service and the pins below. The generator selects
capabilities: `--capability database=postgres` or an answers file. No other provider is
shipped yet; a template lists the providers it has an overlay for.

## Provider manifest

`shared/providers/<kind>/<name>/provider.yaml` holds a Compose service fragment, an env
contract and init files, and knows nothing about a language.

```yaml
schemaVersion: 1
kind: database
id: postgres
name: PostgreSQL 17
service: database                   # the Compose service the fragment defines
compose: compose.yaml               # a partial Compose document: services and volumes
env:
  - name: DATABASE_URL
    summary: Postgres connection URL. Required in production; outside production it defaults to the local service.
    local: postgres://app:app@localhost:5432/app      # outside production
    compose: postgres://app:app@database:5432/app     # inside the compose network
    test: postgres://app:app@localhost:5432/app_test
    testOverride: TEST_DATABASE_URL                   # optional: the variable that overrides `test`
    secret: true                                      # optional: wired in Compose with no default
files: [db/init.sql]                # copied to the project root; creates app_test
```

`compose.yaml` is a partial Compose document with a `services` map that defines `service`
(the healthcheck included) and a top-level `volumes` map for what the service needs. The
generator reads nothing else from it.

## Capability overlay

`<template>/capabilities/<kind>/<provider>/` holds a manifest and an `overlay/` tree. The
tree mirrors the package: its files replace the same path in `base/` or join it (the
engine's infra file, the rewritten db seam and services, the migration script, the
test-database helpers). The manifest has this shape:

```yaml
schemaVersion: 1
kind: database
provider: postgres
summary: Postgres through Bun's built-in SQL client, SQL migrations and a separate test database
dependencies: { add: { dependencies: { … } } }                    # optional
scripts:                                                          # lines for the package manifest
  db:migrate: bun run src/infra/scripts/migrate.ts
  test:db: bun test --preload ./tests/db/setup.ts
commands: { testDb: bun run test:db, migrate: bun run db:migrate }   # merged into the template's
container: { migrate: bun run src/infra/scripts/migrate.ts }      # optional: what the image runs once
flags:                                                            # optional: overlay files that exist
  auth: { onlyPaths: [tests/db/user.test.ts] }                    # only while the template flag is on
pins:                                                             # every base file the overlay shadows
  src/services/db.ts: d0cfb233b926d5658a8e49574b52793699eed9ac
```

`scripts` go into the package manifest through the template's dependency adapter (`npm` for
`bun-express`), appended after the existing scripts. A script name the base already has is
an error at load time, so an overlay never silently replaces one. A `pyproject` template
(`python-fastapi`) has neither `dependencies` nor `scripts` in a capability manifest, and the
loader refuses them: its dependencies and poe tasks are `# @database:postgres` markers in
`pyproject.toml`. `commands` are the vocabulary the agents and `test-generated` use; the
generated project's `.fullstack/catalog.yaml` records them.

- **`container`** holds `migrate`, the command the generated image runs once to apply the
  capability's schema. It exists only for the derived migrate service (see Root assembly); the
  manual `commands.migrate` stays for local development. Python: `python -m
  app.infra.scripts.migrate`; `bun-express`: `bun run src/infra/scripts/migrate.ts`.
- **`pins`** maps each base file the overlay replaces (a path in both `base/` and `overlay/`,
  not one of the capability's flag-only paths) to git's blob id of that base file, with CRLF read
  as LF. `validate` fails on a shadowed file without a pin, a pin for a file that is not
  shadowed, and a pin that no longer matches the base: the base changed after the overlay was
  last reconciled. `bun tools/validate.ts --pin <template>/<kind>/<provider>` rewrites the pins
  and prints the base diff since each old pin. CONTRIBUTING has the workflow.

## Selection pipeline

A template lists the providers it supports under `capabilities.<kind>.providers`. A
selection is `kind=provider`, given as `--capability database=postgres` or in the answers
file. `--capability` finds the kind by name among the templates of the stack; when two
declare it, the answers file says which. A kind or provider the template does not list is
refused with the list it has.

Selections reach the marker pass as two names per kind: `<kind>` (true when any provider is
selected) and `<kind>:<provider>` (true for the chosen one). A line ending in `@database`
or `@database:postgres`, or a block between `@database:postgres-start` and `-end`, is kept
when the name is true; `@nodatabase` keeps it when the kind is not selected. Flags use the
same syntax. In `.sql` files the comment is `--`.

Overlays and flags compose in a fixed order:

1. Copy `base/`.
2. Copy every selected overlay over it.
3. Apply flags: remove `onlyPaths` (the template's, then each selected overlay's
   `flags.<name>.onlyPaths`), run the marker pass, apply dependency changes.
4. Add the overlay's dependencies and scripts, then substitute placeholders.

A flag's `onlyPaths` therefore also removes overlay files at those paths: the postgres
overlay ships its `user` service and `session` rewrite, and `auth=false` drops them. An
overlay file that only makes sense with a flag on belongs under one of that flag's
`onlyPaths`, or is listed in the capability's own `flags.<name>.onlyPaths`; `validate` fails
on a flag the template does not declare and on a path the overlay does not contain.

## Root assembly

The generator completes the project root from the provider, once per project:

- The consuming package's Compose service gets each env entry as
  `NAME: ${NAME:-<compose value>}`, or as plain `NAME: ${NAME}` when the entry is a `secret`
  (an unset secret reaches the package as an empty string, which the package's env module
  rejects in production), and `depends_on` the provider's service with
  `condition: service_healthy`. The bundled provider service and the `depends_on` stay because
  the compose file is the local stack: a developer who exports `DATABASE_URL` pointing at the
  bundled service made a conscious choice, and production does not refuse it.
- The package's `.env.example` gets a block per env entry: its `summary`, the test URL (and
  the variable that overrides it, when the entry has a `testOverride`), and
  `NAME=<local value>`.
- The provider's service and volumes are added to the root `docker-compose.yml`. On a rerun
  the service the file already has is kept and the generator says so.
- A capability with `container.migrate` adds a one-shot service next to the package's, named
  `<dir>-migrate` (`backend-migrate`). It is derived from the assembled package service:
  the same `build` and the same `environment` (the package's env module reads every production
  secret at import), `command` set to the migrate command, no ports, `restart: "no"`, and
  profile `app`. It `depends_on` the provider's service with `condition: service_healthy`, and the
  package service `depends_on` it with `condition: service_completed_successfully`: the
  server starts only after a migration that succeeded, and `docker compose --profile app up
  --build --wait` exits 1 when it fails. On a rerun that finds the package service kept, nothing
  is derived and the generator says the migrate service was not added, because the kept
  service would not wait for it. The clash check knows the derived name.
- The provider's `files` are copied to the project root when absent (create-only; an
  existing file is kept and logged).
- `.fullstack/catalog.yaml` records `providers` (`database: postgres`) and the package's
  capabilities and merged commands (`testDb`, `migrate`).

Selecting no database leaves the in-memory store, so the harness's data-layer task still
applies later. Both paths are kept valid on purpose.

## Cases

Every template's `tests/cases.yaml` covers each flag alone, each capability alone, and each
capability with every flag off. For `bun-express` and `python-fastapi` that is `default`,
`auth-off`, `postgres` and `auth-off-postgres`, plus the stack cases. `validate` fails a listed
provider that lacks the case alone at the default flags or the case with every flag off. The README matrix lists only tested combinations.

`bun tools/test-generated.ts --with-services` runs the provider-backed steps. For a case with
providers it starts their services (`docker compose up -d --wait`), then runs per package
`migrate`, `check`, `testDb` and, with `--e2e`, the e2e suite, and always ends with
`docker compose down -v`. Without the flag a case with providers runs `check` and prints
that `migrate` and `testDb` were skipped. CI passes the flag.

A case may set `withApp: true` (`stack-postgres`, in both server templates). `--with-app` then
runs the app smoke after the gates: it builds the generated project's images, starts the whole
stack with `docker compose --profile app up --build --wait` under throwaway production secrets
(set in the child environment, never written to disk), asks the server's `http.health` and
`http.ready` on the host, and tears the stack down. Without `--with-app` the case prints that the
smoke was skipped. CI passes it, which is where the images are built.

## Database

For a server: a `Resource` connected at boot, pinged by readiness and closed on shutdown;
one data-access file per module; a separate test database; migrations or indexes shipped with the
change that needs them. Migrations are applied by the derived one-shot migrate service on
`docker compose --profile app up`, before the server starts, and by the package's `migrate`
command in development; the server never migrates on boot. For a worker: the same client, no HTTP. These are the harness's
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
