# Changelog

## 2.2.0 — 2026-10-23

- With `database/postgres`, the root `docker-compose.yml` gets a derived one-shot
  `backend-migrate` service on the app profile: the backend's image running `db:migrate` with
  the backend's environment, which the backend waits on (`service_completed_successfully`).
  `docker compose --profile app up --build` now applies the migrations before the backend
  starts, and the backend does not start if they fail. `bun run db:migrate` stays for local
  development. `AGENTS.md` and the README replace the `run --rm backend bun run db:migrate`
  instruction with `docker compose --profile app run --rm backend-migrate`, which needs the
  production secrets exported as the app does.
- The Postgres capability pins the base files its overlay shadows, so a change to one of them
  in `base/` is noticed instead of silently losing to the overlay.
- A new case, `stack-auth-off-postgres` (`next-bun-express`, `auth: false`,
  `database: postgres`).

## 2.1.0 — 2026-10-22

- The `database/postgres` capability. With `--capability database=postgres` the overlay
  replaces `services/db.ts` (`getDb()`, `Executor`) and every module's `service.ts` (and
  `services/session.ts` with `auth`) with Postgres queries over Bun's built-in `SQL`; adds
  `infra/postgres.ts` (a `Resource`, in `dependencies` beside `memory`, which stays the
  cache), SQL migrations in `src/infra/migrations/` applied by `infra/scripts/migrate.ts`
  (`bun run db:migrate`, with a `schema_migration` table and an advisory lock), and
  `services/utils/postgres-error.ts`, which the error handler uses to answer 503
  `upstream_unavailable` for an unreachable database and 409 `conflict` for a unique
  violation. Query functions take an optional last `Executor`, and a module's `service.ts`
  exports `withTransaction`. Tests get `bun run test:db`, which runs everything against the
  `app_test` database.
- The store test seam in `base/`: `tests/store.ts` (`describeStore`, `resetStore`,
  `recordExists`, `deleteRecord`). No test moved; the suites that touched the store call the
  seam. The overlay replaces it so that `describeStore` skips unless the database is named
  `*_test`.
- `DATABASE_URL` is a secret in `config/env.ts`: required in production, defaulted to the
  local service elsewhere. Without a database nothing changes in a generated project. The
  new markers `@database` and `@database:postgres` (and `@nodatabase`) mark the files that
  differ: `env.ts`, `infra/dependency.ts`, `infra/memory.ts`, `error-handler.ts`, `compose.yaml`
  and the tests that follow them.
- In Compose the backend gets `DATABASE_URL` as plain `${DATABASE_URL}`, with no default, so
  the full stack never boots on the bundled credentials without an explicit export. Nothing
  runs the migrations on boot; `AGENTS.md` and the README say when to run `db:migrate`.
  `test:db` exits 1 when it would skip every store-backed suite.
- `AGENTS.md` describes the Postgres variant, and corrects two statements: a query takes the
  `Executor` as an optional last argument (a controller cannot import `services/db.ts`, so a
  module exports `withTransaction`), and the test database is reached through `test:db`'s
  preload and the seam `tests/store.ts`.

## 2.0.0 — 2026-10-22

- `api/<module>/route.ts` is now `routes.ts`: a default-exported `Router` whose middleware
  (rate limiters, validators, role gates) is built once as named constants and whose endpoints
  are one line each, ending in a handler from `controller.ts`.
- `controller.ts` holds the business logic. Each handler, a `(req, res)` function named after
  its operation with no suffix (`createModule`, `getMe`, `login`), holds its endpoint's logic:
  rules, writes through `service.ts`, events, provider calls. Logic another module, a job, a
  subscriber or a script needs is exported as a typed rule function under a name no handler
  uses; those rules are the module's only public API. The user and auth rules that only their
  own handlers called (`updateMe`, `listUser`, `getUser`, `register`, `login`, `refresh`,
  `logout`, `requestOtp`, `verifyOtp`) are now those handlers, `getMe` becomes the rule
  `getCallerUser(caller)` that auth calls, and health's `healthHandler` and `readyHandler(list?)`
  become `getHealth` and `getReadiness(list?)`.
- `repository.ts` is now `service.ts`: the module's queries, private to its controller. The
  rules the old `service.ts` held move into `controller.ts`; `health` loses its `service.ts`
  (it has no data).
- `api/module/` shows the pattern: handlers hold the logic, `service.ts` names its queries
  after the entity (`findModuleById`, `listModules`, `createModule`, `updateModule`,
  `deleteModule`), and create publishes `module.created`, now an event in both variants.
- Password verification moves from the user module to auth; the user controller exports
  `findUserByEmail`, which returns the stored hash beside the public user.
- `schema.ts` exports `<operation>Request` objects, the request parts `validate()` checks in
  `routes.ts` and `readInput()` reads back in the controller.
- `config/routes.ts` exports `registerRoutes(app)`, one `app.use('/api/<name>', …)` per module;
  the OpenAPI registration list moves to `openapi.ts`.
- ESLint zones and `AGENTS.md` follow the new layering.
- `AGENTS.md` gains the agent-facing sections Adding a module, Adding the data layer, Errors and
  Tests, and the last harness-only remarks leave the base.

## 1.0.0 — 2026-10-22

Moved from fullstack-dev-harness `templates/backend` (plan 005 state); auth flag; lockfile committed.
