# Backend

The layer map of `backend/`. What holds for the whole repository (versions, commands,
definition of done) is in the repository's root `AGENTS.md`; nothing here repeats it. This
file ships with the package; an agent working in this directory loads it, and a planner or
reviewer reads it explicitly.

## Packages and conventions

<!-- @auth-start -->
- Packages the template ships beyond Express: `jose` (JWT), `croner` (cron), `helmet`,
  `cors`, `cookie-parser`. Hashing is `Bun.password` (argon2id); HMAC, AES-256-GCM and random
  tokens are `node:crypto`. Nothing else is added without a plan.
<!-- @auth-end -->
<!-- @noauth-start -->
- Packages the template ships beyond Express: `croner` (cron), `helmet`, `cors`. Hashing is
  `Bun.password` (argon2id); HMAC, AES-256-GCM and random tokens are `node:crypto`. Nothing
  else is added without a plan.
<!-- @noauth-end -->
- Logging through `services/logger.ts` (`log.info`, `log.warn`, `log.error`; one line, then
  `key=value` fields; over `console`; a field whose key looks secret prints `[redacted]`):
  one line per request from `middleware/request-log.ts` (method and path, without the query
  string), every unexpected error with its stack from the error handler. No logging library
  until the product needs one; the logger is the seam where it would go.
<!-- @nodatabase-start -->
- Persistence: the template's only store is `infra/memory.ts` (records and key-values in
  process memory, a `Resource`). Every infrastructure dependency is a `Resource` from
  `infra/dependency.ts`, listed in `dependencies` in that file: connected at boot with
  bounded retry, pinged by `GET /api/health/ready`, closed on shutdown. Reconnecting after a
  drop is the driver's job. The data-layer task adds the chosen engine beside `memory`
  (see Adding the data layer).
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
- Persistence: records live in Postgres, through Bun's built-in `SQL` client (no driver
  package is added). `infra/postgres.ts` is its `Resource`, beside `infra/memory.ts`, which is
  now the cache (`services/cache.ts`) until the cache task moves it to its own store. Every
  infrastructure dependency is a `Resource` from `infra/dependency.ts`, listed in
  `dependencies` in that file: connected at boot with bounded retry, pinged by
  `GET /api/health/ready`, closed on shutdown. Reconnecting after a drop is the driver's job:
  the pool does it, and nothing connects at import. The schema is SQL migrations
  (see Adding the data layer).
<!-- @database:postgres-end -->

## Layer map

```
index.ts            env → connect dependencies → listen → shutdown; imported by nothing
server.ts           builds and exports `app`; never listens
openapi.ts          builds the OpenAPI document from every module's schema.ts; `--write` emits it
config/             env.ts · constants.ts · cors.ts · routes.ts
api/<name>/         routes · controller · schema; service only when the module has data
                    (health, auth, user, module: the commented reference) <!-- @auth -->
                    (health, module: the commented reference) <!-- @noauth -->
                    (model.ts: reserved, for an engine that defines storage in code)
models/<name>/      interface.ts · type.ts · enum.ts · constants.ts
<!-- @auth-start -->
middleware/         auth · role · validate · rate-limit · error-handler · not-found ·
                    request-id · request-log · express.d.ts
<!-- @auth-end -->
<!-- @noauth-start -->
middleware/         validate · rate-limit · error-handler · not-found · request-id ·
                    request-log · express.d.ts
<!-- @noauth-end -->
<!-- @auth-start -->
services/           db.ts · cache.ts · event.ts · logger.ts · session.ts
  security/         jwt · cookies · crypto · otp
<!-- @auth-end -->
<!-- @noauth-start -->
services/           db.ts · cache.ts · event.ts · logger.ts
  security/         crypto
<!-- @noauth-end -->
  communicate/      index.ts · mail · sms · whatsapp · templates/ <!-- @auth -->
  communicate/      index.ts · mail · sms · whatsapp (templates/ arrives with the first message) <!-- @noauth -->
  utils/            error · zod · openapi · pagination · time (pure, no I/O) <!-- @nodatabase -->
  utils/            error · zod · openapi · pagination · postgres-error · time (pure, no I/O) <!-- @database:postgres -->
infra/              dependency.ts · memory.ts · scheduler.ts · pubsub.ts <!-- @nodatabase -->
infra/              dependency.ts · postgres.ts · memory.ts · scheduler.ts · pubsub.ts <!-- @database:postgres -->
  jobs/             one file per background job
  subscribers/      one file per event reaction
  migrations/       NNNN-<topic>.sql, the schema, applied in name order <!-- @database:postgres -->
  scripts/          one-off commands (reserved: migrate, seed) <!-- @nodatabase -->
                    (reserved: <engine>.ts, redis.ts, the real connections) <!-- @nodatabase -->
  scripts/          one-off commands: migrate.ts (db:migrate); seed is reserved <!-- @database:postgres -->
                    (reserved: redis.ts, the cache's real connection) <!-- @database:postgres -->
```

- `index.ts` is the process entry and the only file that listens. It reads `config/env.ts`,
  connects `dependencies`, calls `app.listen`, binds `SIGTERM` and `SIGINT` to the shutdown
  from `infra/dependency.ts` (drain, close every resource, exit; 10 s cap) and warns once
  per defaulted secret.
- `server.ts` builds and exports `app`, nothing else: security and cross-cutting middleware
  first, then `registerRoutes(app)` from `config/routes.ts` mounts every module under `/api`,
  then `notFound` and `errorHandler` last. Tests import `app` and never start infra.
- `openapi.ts` builds the OpenAPI document from its `registrations` list, one module's
  `register<Name>` (from its `schema.ts`) per line in mount order; `bun run openapi` writes
  `openapi.json`.
- `config/`: `env.ts` is the only reader of `process.env` (zod, fails fast; production
<!-- @auth-start -->
  requires the secrets, elsewhere they default; it exports `env` and `defaultedSecrets`).
  `constants.ts` holds policy: durations, attempts, rate-limit windows, `COOKIE_NAMES` and
  `COOKIE_PATHS`, header names. `cors.ts` builds the CORS options. `routes.ts` is the
<!-- @auth-end -->
<!-- @noauth-start -->
  requires `ENCRYPTION_KEY`, elsewhere it defaults; it exports `env` and `defaultedSecrets`).
  `constants.ts` holds policy: durations, attempts, rate-limit windows, header names.
  `cors.ts` builds the CORS options. `routes.ts` is the
<!-- @noauth-end -->
  mount table: `registerRoutes(app)`, one `app.use('/api/<name>', <name>Routes)` line per
  module, with any mount-wide middleware between the path and the router.
- `api/<name>/`: one directory per module, singular name, mounted at `/api/<name>`. A module
<!-- @auth-start -->
  is a resource (`user`) or a capability (`auth`, `health`). A module has the files it needs:
  `service.ts` only with data of its own (`health` and `auth` have none).
<!-- @auth-end -->
<!-- @noauth-start -->
  is a resource or a capability (`health`). A module has the files it needs: `service.ts`
  only with data of its own (`health` has none).
<!-- @noauth-end -->
  - `schema.ts`: zod request and response schemas, the request parts each endpoint validates
    (`<operation>Request`, e.g. `{ params: ModuleIdParams, body: UpdateModuleBody }`) and
    their OpenAPI registration. The leaf of the module.
  - `routes.ts`: the module's Express `Router`, default-exported. The middleware (rate
    limiters, `validate(<operation>Request)`, role gates) is built once as named constants,
    then each endpoint is one line: `router.<method>(path, ...middleware, <operation>)`.
    No inline handlers, no logic.
  - `controller.ts`: the module's business logic and its only door. Two kinds of export:
    - Handlers: one `(req, res)` function per endpoint, named after its operation with no
      suffix (`createModule`, `getMe`, `login`), holding that endpoint's
      logic. It reads the parsed input with `readInput(res, <operation>Request)`, applies
      the rules (throwing `AppError`), reads and writes through its own `service.ts`, maps
      records to response shapes, publishes events, calls providers, owns transactions when
      the engine has them, and sends the status and body. `api/module/` is the example.
<!-- @auth-start -->
      Auth handlers also set or clear cookies: cookies are transport, so they belong to the
      handler.
<!-- @auth-end -->
    - Rules: logic another module's controller, a job, a subscriber or a script needs is
      exported as a typed function with no `req`, no `res` and no status code; a handler
      that needs the same logic calls it. A module exports none until something outside it
<!-- @auth-start -->
      needs one: `api/user/` exports the ones auth and the welcome subscriber call
      (`getCallerUser(caller)`, `getActiveUser(id)`, `findUserByEmail(email)`, …). A rule
      never takes a handler's name, since both are exports of one file: `getMe` is the
      handler, `getCallerUser` the rule it shares with auth.
<!-- @auth-end -->
<!-- @noauth-start -->
      needs one. A rule never takes a handler's name, since both are exports of one file.
<!-- @noauth-end -->
  - `service.ts` (and `model.ts`): every query for the module and nothing else, private to
    it: only its own controller imports it. The only module files that import
    `services/db.ts` or `services/cache.ts`.
- `models/<name>/`: an entity's TypeScript types, shared by every layer. `interface.ts` the
  stored record, `type.ts` the public shape, the create and update inputs and derived
  types, `enum.ts` closed value sets (`as const` object plus derived union), `constants.ts`
  limits of the data itself. A directory has the files it needs. One declaration, one
  validator: a schema for a shape declared in `models/` is written `satisfies
  z.ZodType<T>` and never re-exports a `z.infer` alias; shapes that exist only for HTTP
  (params, query, credentials) live in `schema.ts` with their `z.infer` type. `models/`
  (plural, types) and `model.ts` (singular, in a module, the engine's storage mapping that
  satisfies `models/<name>/interface.ts`) are different things.
<!-- @auth-start -->
  A capability module whose types other layers share still gets a `models/` directory:
  `models/auth/` holds `Caller`, `AuthTokens` and `OtpPurpose`.
<!-- @auth-end -->
<!-- @noauth-start -->
  A capability module whose types other layers share still gets a `models/` directory.
<!-- @noauth-end -->
<!-- @auth-start -->
- `middleware/`: request handling an endpoint or every request needs. `auth.ts` resolves the
  caller, `role.ts` gates by role, `validate.ts` validates, `rate-limit.ts` limits (the key holds a hash of the subject).
  `express.d.ts` types `res.locals`.
<!-- @auth-end -->
<!-- @noauth-start -->
- `middleware/`: request handling an endpoint or every request needs. `validate.ts` validates,
  `rate-limit.ts` limits (the key holds a hash of the subject). `express.d.ts` types
  `res.locals`.
<!-- @noauth-end -->
<!-- @auth-start -->
- `services/`: stateful or I/O capabilities shared by modules: the stores' seams, events,
  logging, sessions, `security/` (tokens, cookies, hashing, OTP), `communicate/` (channels,
  providers, message templates), and `utils/` (pure, stateless, no I/O).
<!-- @auth-end -->
<!-- @noauth-start -->
- `services/`: stateful or I/O capabilities shared by modules: the stores' seams, events,
  logging, `security/` (hashing, encryption), `communicate/` (channels, providers, message
  templates), and `utils/` (pure, stateless, no I/O).
<!-- @noauth-end -->
- `infra/`: live connections and what runs on them. `dependency.ts` holds `Resource`, the
<!-- @nodatabase-start -->
  `dependencies` list in connection order (`memory`, `pubsub`, `scheduler`), `connectAll`,
  `disconnectAll`, `healthCheck`, `withRetry` and `createShutdown`. `scheduler.ts` registers
  `jobs/`; `pubsub.ts` is the in-process bus and registers `subscribers/`; `scripts/`
  holds one-off commands.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
  `dependencies` list in connection order (`memory`, `postgres`, `pubsub`, `scheduler`),
  `connectAll`, `disconnectAll`, `healthCheck`, `withRetry` and `createShutdown`.
  `postgres.ts` is the Postgres store (the client is built on first use and `close` forgets
  it). `memory.ts` holds no records now: it is the key-value store behind `services/cache.ts`
  (and the rate limits). `scheduler.ts` registers `jobs/`; `pubsub.ts` is the in-process bus
  and registers `subscribers/`; `migrations/` holds the SQL files and `scripts/` the one-off
  commands, `migrate.ts` among them.
<!-- @database:postgres-end -->

## Where does X go

| You are adding… | It goes in | Shape |
| --- | --- | --- |
| A resource or capability with endpoints | `api/<name>/` | copy `api/module/`, rename `module`, `Module`, `MODULE`; one line in `config/routes.ts` and one in `openapi.ts` |
| An entity's types | `models/<name>/` | copy `models/module/` |
| A limit on an entity's field | `models/<name>/constants.ts` | lengths, ranges, defaults of the data |
| A policy constant | `config/constants.ts` | durations, attempts, windows, cookie and header names | <!-- @auth -->
| A policy constant | `config/constants.ts` | durations, attempts, windows, header names | <!-- @noauth -->
| A request or response shape | `api/<name>/schema.ts` | zod; `satisfies` the `models/` type; OpenAPI registration |
| An endpoint | `api/<name>/routes.ts` + `controller.ts` | one `router.<method>` line; one handler named after the operation (`createModule`); its `<operation>Request` in `schema.ts` |
| A business rule, an event to publish, a call to another service | `api/<name>/controller.ts` | in the endpoint's handler; an exported rule once something outside the module needs it; throws `AppError` |
| A rule composing other modules | `api/<name>/controller.ts` | `api/auth/` is the example | <!-- @auth -->
| A rule composing other modules | `api/<name>/controller.ts` | calls each module's `controller.ts` | <!-- @noauth -->
| A query | `api/<name>/service.ts` | `services/db.ts`, `services/cache.ts`; private to the module | <!-- @nodatabase -->
| A query | `api/<name>/service.ts` | SQL through `getDb()`; an optional last `db: Executor = getDb()` parameter; private to the module | <!-- @database:postgres -->
| A change to the tables or indexes | `infra/migrations/NNNN-<topic>.sql` | the next number, never an edit to an applied file; then `bun run db:migrate`; update the module's `service.ts` and its row mapping | <!-- @database:postgres -->
| Something another module needs | `api/<name>/controller.ts` | an exported rule; the only cross-module import |
| Shared behaviour with state or I/O | `services/<name>.ts` | sessions, cache, events, logging | <!-- @auth -->
| Shared behaviour with state or I/O | `services/<name>.ts` | cache, events, logging | <!-- @noauth -->
| A vendor SDK wrapper | `services/<vendor>.ts` | thin; key from `config/env.ts`; the SDK is imported only here |
| A pure helper | `services/utils/<name>.ts` | no I/O, no state |
| A security primitive | `services/security/<name>.ts` | hashing, tokens, cookies, OTP | <!-- @auth -->
| A security primitive | `services/security/<name>.ts` | hashing, encryption, tokens | <!-- @noauth -->
| A way to reach a person | `services/communicate/<channel>.ts` | `Provider` type, console provider, env selection |
| A real provider for a channel | `services/<vendor>.ts` + a case in the channel file | `MAIL_PROVIDER=<vendor>` selects it |
| A message's wording | `services/communicate/templates/<name>.ts` | pure function → `{ subject?, text }` |
| Request handling endpoints share | `middleware/<name>.ts` | mounted in `routes.ts`, in `config/routes.ts` for a whole module, or `server.ts` when cross-cutting |
| A live connection (database, cache, queue) | `infra/<store>.ts` | a `Resource` in `dependencies`; reached through `services/db.ts`, `cache.ts`, `event.ts` |
| A background job | `infra/jobs/<name>.ts` | `{ name, schedule, run }`; listed in `infra/scheduler.ts` |
| An event | `services/event.ts` | add it to the event map; `publish` from a controller; handlers run detached, tests await `drain()` |
| A reaction to an event | `infra/subscribers/<name>.ts` | `{ topic, handle }`; listed in `infra/pubsub.ts` |
| A one-off command (migrate, seed) | `infra/scripts/<name>.ts` | `bun run src/infra/scripts/<name>.ts`; may call controllers' rules | <!-- @nodatabase -->
| A one-off command (seed) | `infra/scripts/<name>.ts` | `bun run src/infra/scripts/<name>.ts`; may call controllers' rules; `migrate.ts` is the shipped one | <!-- @database:postgres -->
| An environment variable | `config/env.ts` + `.env.example` | required in production, defaulted elsewhere |
| An allowed browser origin | `config/cors.ts` | set `CORS_ORIGINS`, only when a browser calls the API directly |

## Request flow

`config/routes.ts → api/<name>/routes.ts → middleware → controller.ts (handler, and any
rule it shares) → service.ts → services/db.ts → infra/<store>.ts`. A `routes.ts` holds
nothing but the middleware chain and the handler per endpoint. A handler holds its
endpoint's logic; it reaches its own data only through its `service.ts` and other modules
only through their `controller.ts` rules.

## Import direction

The leaves: `models/**` imports only `models/**`; `config/constants.ts` imports nothing;
`config/env.ts` imports zod only; `config/cors.ts` imports `config/env.ts`.

| File | May import | Never |
| --- | --- | --- |
| `config/routes.ts` | every module's `api/<m>/routes.ts`, `middleware/` | anything else |
| `openapi.ts` | every module's `api/<m>/schema.ts`, `services/utils/` | anything else |
| `services/utils/**` | `models/`, `config/constants.ts`, `config/env.ts`, `services/utils/` | `infra/`, other `services/`, `api/`, `middleware/` |
| `services/db.ts`, `services/cache.ts` | `infra/memory.ts` (later the engine), `services/logger.ts`, `services/utils/`, `config/` (not `routes.ts`), `models/` | `api/`, `middleware/` | <!-- @nodatabase -->
| `services/db.ts`, `services/cache.ts` | `infra/postgres.ts` (`db.ts`), `infra/memory.ts` (`cache.ts`), `services/logger.ts`, `services/utils/`, `config/` (not `routes.ts`), `models/` | `api/`, `middleware/` | <!-- @database:postgres -->
| `services/event.ts` | `infra/pubsub.ts`, `services/logger.ts`, `services/utils/`, `models/` | `api/`, `middleware/` |
| other `services/**` | `services/**`, `models/`, `config/` (not `routes.ts`), `infra/dependency.ts` | `infra/` stores and bus, `api/`, `middleware/`, `server.ts`, `index.ts` |
| `middleware/**` | `services/**` except `services/db.ts`; `services/cache.ts` only from `rate-limit.ts`; `models/`, `config/` (not `routes.ts`) | `services/db.ts`, `api/`, `infra/` |
| `infra/**` | `infra/**`, `services/logger.ts`, `services/utils/`, `services/db.ts`, `services/cache.ts`, `services/session.ts`, `services/event.ts`, `config/` (not `routes.ts`), `models/` | `middleware/`, `server.ts`, `index.ts`, `api/` | <!-- @auth -->
| `infra/**` | `infra/**`, `services/logger.ts`, `services/utils/`, `services/db.ts`, `services/cache.ts`, `services/event.ts`, `config/` (not `routes.ts`), `models/` | `middleware/`, `server.ts`, `index.ts`, `api/` | <!-- @noauth -->
| `infra/jobs/**`, `infra/subscribers/**`, `infra/scripts/**` | the row above, `api/<m>/controller.ts` (its rules), types from `api/<m>/schema.ts`, any `services/**`; scripts also `api/<m>/model.ts` | `api/<m>/routes.ts`, `service.ts` |
| `api/<m>/schema.ts` | `services/utils/`, `models/`, `config/constants.ts`, another module's `schema.ts` | everything else |
| `api/<m>/routes.ts` | own `controller.ts` and `schema.ts`, `middleware/`, `services/utils/`, `models/`, `config/constants.ts` | own `service.ts`, `model.ts`; other `services/`, `infra/`; any other module |
| `api/<m>/controller.ts` | own `service.ts` and `schema.ts`, other modules' `controller.ts` and `schema.ts`, `express`, `middleware/`, `services/**` except `services/db.ts`, `services/cache.ts`; `models/`, `config/` (not `routes.ts`), `infra/dependency.ts` | any `routes.ts` or `model.ts`; another module's `service.ts` |
| `api/<m>/service.ts`, `model.ts` | `services/db.ts`, `services/cache.ts`, `services/logger.ts`, `services/utils/`, `models/`, `config/constants.ts`, own `model.ts` | `express`, `routes.ts`, `controller.ts`, `schema.ts`, `services/event.ts`; any other module |
| `server.ts` | `middleware/`, `config/` (incl. `routes.ts`), `openapi.ts`, `services/logger.ts` | `api/` directly, `infra/` |
| `index.ts` | `config/env.ts`, `infra/dependency.ts`, `services/logger.ts`, `server.ts` | |

- `config/routes.ts` is imported only by `server.ts` and tests; the other three `config/`
  files are open to every layer the table allows.
- `infra/dependency.ts` may be imported by anything except `models/`, `config/` and
  `services/utils/`; the health module reads `healthCheck` and `dependencies` as values,
  the rest import its types.
<!-- @nodatabase-start -->
- `infra/memory.ts` (later `infra/<engine>.ts`, `infra/redis.ts`) is imported only by
  `services/db.ts`, `services/cache.ts` and `infra/**`; `infra/pubsub.ts` only by
  `services/event.ts` and `infra/**`.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
- A store (`infra/postgres.ts`, `infra/memory.ts`, later `infra/redis.ts`) is imported only
  by `services/db.ts`, `services/cache.ts` and `infra/**`: `db.ts` imports `postgres.ts`,
  `cache.ts` imports `memory.ts`; `infra/pubsub.ts` only by `services/event.ts` and
  `infra/**`.
<!-- @database:postgres-end -->
- A module reaches a store only through its `service.ts` and `model.ts`; ESLint refuses
  `services/db.ts` and `services/cache.ts` in `routes.ts`, `controller.ts` and `schema.ts`.
  A file in `services/` may use them directly.
- Across modules: another module's `schema.ts` is imported as a type anywhere, as a value
<!-- @auth-start -->
  only by `controller.ts` and `schema.ts`; behaviour crosses only through `controller.ts`,
  and a module's `service.ts` is never imported from outside it. A rule forwards the caller
  it received. A cross-module flow is not atomic: each rule call is its own unit of work; a
  flow that must be atomic lives in one module.
<!-- @auth-end -->
<!-- @noauth-start -->
  only by `controller.ts` and `schema.ts`; behaviour crosses only through `controller.ts`,
  and a module's `service.ts` is never imported from outside it. A cross-module flow is not
  atomic: each rule call is its own unit of work; a flow that must be atomic lives in one
  module.
<!-- @noauth-end -->
- Nothing imports `index.ts`; only `index.ts` and tests import `server.ts`.
- Review rules, also not lintable: a vendor SDK package is imported only by its
  `services/<vendor>.ts`; a `routes.ts` holds no logic; another module, a job or a script
  calls a controller's rules, never its handlers.

ESLint enforces the import rules: the leaves, the table's allowed and forbidden imports per
file, and the named import rules, except that it cannot tell a type import from a value import
<!-- @auth-start -->
of `infra/dependency.ts`. The behaviour statements (a rule forwards the caller, a
cross-module flow is not atomic) and the review rules are review rules.
<!-- @auth-end -->
<!-- @noauth-start -->
of `infra/dependency.ts`. The behaviour statement (a cross-module flow is not atomic) and the
review rules are review rules.
<!-- @noauth-end -->

<!-- @auth-start -->
## Authentication

The template ships working auth (`api/auth/`, `api/user/`); a product starts from it. The
client, token, OTP and verification model is recorded in the project's architecture record
(Auth) and changes only by plan. The verify functions in `security/jwt.ts` return `null` for an
invalid or expired token.

- Where rules live. Every module's rules live in its `controller.ts`. A capability module
  whose rules only compose other modules and services has no `service.ts`, and its
  controller holds the composition; `api/auth/` is the shipped example. Rules about user
  data (a blocked account, a phone already in use) stay in the user controller; credential
  rules (verifying a password, what a blocked account learns, and when) are auth's.
- The password hash. Every rule the user controller exports returns the public shape,
  except `findUserByEmail`, which hands auth the stored hash beside the user (never inside
  it) for auth to verify. Auth never returns or logs it.
- Authorization. `requireAuth` and `requireRole` in `routes.ts` are declarative and fail
  fast; the handler checks the role again, so an endpoint mounted without its gate fails
  closed. A rule that takes a caller acts only on that caller's own account
  (`getCallerUser`), so a cross-module call cannot reach further than the route would.
  Operations only other modules, jobs or scripts
  call take no caller and are named system operations: `createUser`, `findUserByEmail`,
  `findUserByTarget`, `getActiveUser`, `markVerified`, `setUserRole`. There is no admin
  bootstrap: the seed script calls `setUserRole`.
<!-- @auth-end -->
<!-- @noauth-start -->
## Authentication

This scaffold was generated with the `auth` flag off (recorded as Auth: none in
the project's architecture record): every endpoint is public and no module takes a caller.
Adding authentication later is a planned change, not a patch to one module.
<!-- @noauth-end -->

## The engine seam

<!-- @nodatabase-start -->
`services/db.ts` and `services/cache.ts` are file seams, not type seams: each exports the
active store, and the type changes with the engine. The data-layer task rewrites `db.ts`,
every module's `service.ts` and `services/session.ts`, adds `infra/<engine>.ts` and <!-- @auth -->
`infra/scripts/migrate.ts`, and adds the engine resource to `dependencies`; `memory` leaves <!-- @auth -->
it only when the cache task has moved `services/cache.ts` to its own store. The cache task <!-- @auth -->
every module's `service.ts`, adds `infra/<engine>.ts` and `infra/scripts/migrate.ts`, and <!-- @noauth -->
adds the engine resource to `dependencies`; `memory` leaves it only when the cache task has <!-- @noauth -->
moved `services/cache.ts` to its own store. The cache task <!-- @noauth -->
rewrites `cache.ts`, adds `infra/redis.ts` and gives `infra/pubsub.ts` its adapter
(see Adding the data layer). Until then nothing survives a restart.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
`services/db.ts` and `services/cache.ts` are file seams, not type seams: each exports the
active store, and the type changes with the engine. Here `services/db.ts` exports:

- `getDb()`: the Bun `SQL` client, a pool owned by `infra/postgres.ts`. Call it inside the
  function that queries, never at file scope: the client is built on first use and replaced
  after a close.
- `Executor`: `SQL | TransactionSQL`, the client or an open transaction.

Only a module's `service.ts` (and `model.ts`) and the files of `services/` and `infra/`
import it; ESLint refuses it in `routes.ts`, `controller.ts` and `schema.ts`. Every query
function in a module's `service.ts` takes an optional last parameter, `db: Executor = getDb()`.
Without it the query takes its own connection from the pool; with it the query runs on the
handle given. A controller cannot import `services/db.ts`, so a module that must write two
things together exports `withTransaction(work)` from its `service.ts`
(`api/module/service.ts` is the example): the controller opens it and passes the handle it
receives to each query as the last argument. A service function never opens a transaction,
and a transaction never spans modules.

`services/cache.ts` is still on `infra/memory.ts`. The cache task rewrites `cache.ts`, adds
`infra/redis.ts` and gives `infra/pubsub.ts` its adapter (see Adding the data layer). Until
then the cache, the rate limits and the bus do not survive a restart or span replicas;
the records do.
<!-- @database:postgres-end -->

The layer map is language-neutral on purpose: the Python and .NET server templates mirror
the same directories and rules.

## Adding a module

Work in this order, test first.

1. Types in `models/<name>/`.
2. `schema.ts`: zod schemas that `satisfies` the `models/` types, one `<operation>Request`
   object per endpoint (only the parts it reads) and `register<Name>`.
3. `tests/<name>.test.ts` (see Tests), red.
4. `service.ts`, only when the module has data (`findModuleById`, `listModules`).
5. `controller.ts`: one handler per endpoint, then the exported rules other modules need.
6. `routes.ts`: middleware as named constants, then one `router.<method>` line per endpoint.
7. One line in `config/routes.ts` and one in `openapi.ts`; `bun run openapi`, then
   `bun run check`.

Start by copying `api/module/` and `models/module/`, renaming in directories, files,
identifiers, comments and constants: `module` to `<name>`, `Module` to `<Name>`, `MODULE` to
`<NAME>`. Drop the reference module (both directories, its lines in `config/routes.ts` and
`openapi.ts`, `tests/module.test.ts`) once a real one exists.

- One request object, two readers: `validate(<operation>Request)` in `routes.ts` and
  `readInput(res, <operation>Request)` in the handler, so the types follow the schemas.
<!-- @auth-start -->
- Fail closed. `routes.ts` mounts `requireAuth`, and `requireRole('admin')` where a role is
  needed; the handler calls `requireCaller(res)` and checks the role again, so an endpoint
  mounted without its gate still refuses. A rule that takes a caller acts only on that
  caller's own data.
<!-- @auth-end -->
<!-- @noauth-start -->
- Every endpoint is public: no gate, no caller. A plan that adds accounts adds both.
<!-- @noauth-end -->
- Every list endpoint paginates with `PageQuery` and `pageOf` from
  `services/utils/pagination.ts`: `?cursor=&limit=` in, `{ items, nextCursor }` out. The
  service fetches `limit + 1` rows and `toPage` slices; the cursor is opaque to clients.
- Another module is reached only through its exported controller rules, never its `service.ts`.
- A module with data ships its table in a migration (see Adding the data layer), and its <!-- @database:postgres -->
  `service.ts` is written like `api/module/service.ts`: a row type, one `toRecord` mapping, <!-- @database:postgres -->
  an optional last `db: Executor` parameter on every query. <!-- @database:postgres -->
- Paths are singular (`/api/post`, `/api/post/:id`), bodies are JSON only. Statuses: 200
  read and update, 201 create (the created resource), 204 delete (no body), 400 validation,
<!-- @auth-start -->
  401 unauthenticated, 403 forbidden,
<!-- @auth-end -->
  404 missing, 409 conflict.

`api/module/` is the worked example.

## Adding the data layer

<!-- @nodatabase-start -->
The data-layer task swaps `infra/memory.ts` for a real engine behind The engine seam. It
delivers:

1. `infra/<engine>.ts`: the client and its `Resource` (`connect` with bounded retry, `ping`
   as the cheapest round trip, `close`), joining `dependencies` (`memory` stays until the
   cache task has replaced `services/cache.ts`, whose TTL sweep starts in its `connect()`); no
   connecting at import, since `bun run check` imports `app` without Docker.
2. `services/db.ts` rewritten to export the engine client (its type changes).
3. Every module's `service.ts` rewritten against it, signatures unchanged. <!-- @noauth -->
3. Every module's `service.ts` and `services/session.ts`, signatures unchanged. <!-- @auth -->
4. `model.ts` where the engine defines storage in code, held to `models/<name>/interface.ts`.
5. `infra/scripts/migrate.ts` and a `db:migrate` script in `package.json`.
6. `DATABASE_URL` in `config/env.ts` and `.env.example`; the engine's Compose service at the
   project root (`docker compose up -d --wait <service>`).
7. A test database, a `test:db` script and `tests/store.ts` rewritten for the engine (below).

Every engine: a record has a string `id` and `createdAt` and `updatedAt` set on every write;
an unreachable store surfaces as `AppError('upstream_unavailable')`; a transaction belongs to
one module's controller and never spans modules. For an SQL engine every query function in a
module's `service.ts` takes the client or an open transaction as an optional last argument
(one `Executor` type covers both, defaulting to the client). A controller cannot import
`services/db.ts`, so the module's `service.ts` exports a `withTransaction` helper; the
controller opens it and passes the handle to each query. Every field a query filters or sorts on is
indexed, including the `(createdAt, id)` pair behind cursor pagination; a change to the
stored shape ships its migration or index definition in the same task. Dropping or resetting
a database is a human's job.
Auth assumes: `rotateSession` is a conditional update, so one rotation wins; email is <!-- @auth -->
unique, phone only among verified phones (a partial unique index). <!-- @auth -->

Test database: a second database `app_test` on the same service. `bun run test:db` is
`bun test --preload ./tests/db/setup.ts`; the preload points `DATABASE_URL` at `app_test`
before `config/env.ts` loads. A suite that touches the store reaches it only through the test
seam `tests/store.ts` (`describeStore`, `resetStore`, `recordExists`, `deleteRecord`), which
the data-layer task rewrites for the engine: `describeStore` becomes `describe.skip` unless
`DATABASE_URL` names a database ending in `_test`, and `resetStore()` refuses to truncate any
other. Then `check` skips the store-backed suites and `test:db` runs the whole suite; tests
that only the engine can answer live in `tests/db/`. Never fake a service with
`mock.module`: it is process-global in `bun test`.

- Postgres: Bun's built-in `SQL`. Migrations are SQL files applied in order by `db:migrate`.
  Singular snake_case tables and columns; `service.ts` maps rows to the camelCase record.
  The index ships with the migration that needs it. `resetStore()` truncates.
- MongoDB: the `mongodb` driver. Singular collections, camelCase fields. `model.ts` exports
  the collection name, document type and index definitions; `migrate.ts` creates the indexes
  and runs backfills when a stored shape changes. Transactions need a replica set.
- Cache (Redis or Valkey), its own task: `services/cache.ts` over `infra/redis.ts` (a
  `Resource`), same helpers; keys prefixed, always with a TTL; `incr` sets the TTL on the
  first increment only; `infra/pubsub.ts` gets its adapter.
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
The data layer is in place: this project was generated with `database/postgres`. It holds:

- `infra/postgres.ts`: the `Resource` over Bun's built-in `SQL` (a pool; nothing connects at
  import), in `dependencies` beside `memory`, which stays as the cache until the cache task.
- `services/db.ts`: the seam (`getDb()`, `Executor`; see The engine seam).
- Every module's `service.ts` in SQL. `api/module/service.ts` is the reference: a row type,
  one `toRecord` mapping from snake_case columns to the camelCase record, `withTransaction`,
  and cursor pagination over `(created_at, id)`. `model.ts` stays unused. <!-- @noauth -->
  and cursor pagination over `(created_at, id)`. `api/user/service.ts` and <!-- @auth -->
  `services/session.ts` are in SQL too. `model.ts` stays unused. <!-- @auth -->
- `infra/migrations/`, `infra/scripts/migrate.ts` and the `db:migrate` script.
- `services/utils/postgres-error.ts`, applied by `middleware/error-handler.ts` (see Errors).
- `DATABASE_URL` in `config/env.ts` and `.env.example`, the `database` service in the
  project's `docker-compose.yml` with its `db/init.sql`, and the test seam and `test:db`
  (below).

Every record has a `text` `id` the application generates, and `created_at` and `updated_at`
set on every write. A transaction belongs to one module's controller and never spans modules.
Dropping or resetting a database is a human's job.

Changing the data model, in this order:

1. Write the failing test first, in a suite under `describeStore` (see Tests).
2. Add `src/infra/migrations/NNNN-<topic>.sql`: the next four-digit number, a kebab-case topic,
   plain SQL. Files apply in name order. Each file runs once, in one transaction together
   with its row in `schema_migration`, so it holds no statement that cannot run in a
   transaction (`create index concurrently`). Never edit or rename an applied migration: a
   change is a new file. `0001-init.sql` is the reference.
3. Tables and columns are singular snake_case (a reserved word such as `"user"` is quoted),
   timestamps are `timestamptz`.
4. An index ships with the migration that needs it: every column a query filters or sorts on,
   including the `(created_at, id)` pair behind cursor pagination.
5. Update the module's `service.ts`, its row type and `toRecord`, and
   `models/<name>/interface.ts`.
6. `bun run db:migrate`, then `bun run test:db`, then `bun run check`.

The `module` table in `0001-init.sql` belongs to the reference module. Drop it with a new
migration once the module is removed, unless no database has applied `0001-init.sql` yet.

Commands:

- `bun run db:migrate` applies the files `schema_migration` does not list, in name order, and
  logs each one. It takes a Postgres advisory lock, so two runs started together take turns.
  A file that fails leaves itself unapplied (its transaction rolls back) and the command exits
  1. The server never migrates on its own.
- `bun run test:db` runs the whole suite against `app_test`.

Local service: `docker compose up -d --wait database` at the project root starts Postgres 17 on
`127.0.0.1:5432` and returns when it is healthy (`migrate` has no connect retry, and on a fresh
volume the image is not ready right away). `DATABASE_URL` is a secret, since it carries the
password: required in production, defaulted outside it to
`postgres://app:app@localhost:5432/app` (the entry warns once, like any defaulted secret), and
it must be a `postgres://` or `postgresql://` URL. In `docker-compose.yml` it is wired as a
plain `${DATABASE_URL}` with no default, like the other production secrets: the backend runs
with `NODE_ENV: production`, so an unset variable (Compose passes an empty string) stops it at
startup with a message naming `DATABASE_URL`. To run the full stack locally, export a
`DATABASE_URL`, e.g. `postgres://app:app@database:5432/app` to use the bundled service. Production
does not refuse those bundled credentials themselves: exporting them is a conscious choice. The
bundled `database` service and the backend's `depends_on` on it stay, because the compose file
is the local stack.

Test database: `app_test` on the same service, created by `db/init.sql` when the volume is
first created; a volume that already existed needs `create database app_test owner app;` run
once by hand. `tests/db/setup.ts`, preloaded by `test:db`, points `DATABASE_URL` at
`TEST_DATABASE_URL` (default `postgres://app:app@localhost:5432/app_test`) before
`config/env.ts` loads, refuses a database whose name does not end in `_test`, applies the
migrations and, when the database cannot be reached, exits 1 with one line saying so. It also
exits 1 when `describeStore` would skip every store-backed suite, so `test:db` cannot pass on
zero tests. Never fake the database with `mock.module`: it is process-global in `bun test`.

Production: the server never migrates on boot. In the Compose stack the one-shot
`backend-migrate` service (app profile) runs `db:migrate` from the backend's image with the same
environment, and the backend waits for it to finish successfully:
`docker compose --profile app up --build` applies the migrations before the backend starts, and
the backend does not start if they fail. To run it alone:
`docker compose --profile app run --rm backend-migrate`; like the app, it needs the production
secrets and `DATABASE_URL` exported. `bun run db:migrate` stays for local development.
Elsewhere the deploy pipeline runs it before serving traffic and after every deploy that ships a
migration, from the same image and with the same environment as the server (the env module
validates all of it). A migration the old version must survive is written backwards
compatible, since the old image keeps serving until the new one starts.

Auth assumes, as built: <!-- @auth -->
`rotateSession` is one conditional update (`where id = … and token_hash = <presented hash> <!-- @auth -->
and revoked_at is null`), so one rotation wins; the loser re-reads and answers from the <!-- @auth -->
grace window or is refused as a replay. There is no per-session lock. <!-- @auth -->
`revokeSession` and `revokeAllSessions` are single filtered updates that also clear <!-- @auth -->
`grace_token`, and `purgeExpired(now)` is one delete of the revoked and expired rows that <!-- @auth -->
returns their count. Time comes from the caller, never from `now()` in SQL. <!-- @auth -->
`user.email` has a unique index (the controller lower-cases it); `user.phone` is unique only <!-- @auth -->
among verified phones (a partial unique index where `phone_verified_at is not null`). <!-- @auth -->
`session` is indexed on `user_id` and `expires_at` and has no foreign key to `"user"`: <!-- @auth -->
modules stay independent. <!-- @auth -->

The cache is its own task: `services/cache.ts` over `infra/redis.ts` (a `Resource`), same
helpers; keys prefixed, always with a TTL; `incr` sets the TTL on the first increment only;
`infra/pubsub.ts` gets its adapter.
<!-- @database:postgres-end -->

## Errors

Controllers and services throw `AppError(code, message, details?)` from
`services/utils/error.ts`; only `middleware/error-handler.ts` builds an error response.

| Code | Status | Use for |
| --- | --- | --- |
| `validation_failed` | 400 | bad input; `details` is `{ path, message }[]` |
<!-- @auth-start -->
| `unauthenticated` | 401 | missing, invalid or expired token; wrong credentials |
| `forbidden` | 403 | authenticated but not allowed: role, blocked account, another user's data |
<!-- @auth-end -->
| `not_found` | 404 | missing resource, or one the caller may not know exists |
| `conflict` | 409 | state conflict, duplicate key |
| `payload_too_large`, `unsupported_media_type`, `rate_limited` | 413, 415, 429 | body parser limits; throttling |
| `internal` | 500 | unexpected |
| `upstream_unavailable` | 503 | a dependency failed; safe to retry later |

The envelope is `{ "error": { "code", "message", "details"? }, "requestId" }` (`ErrorBody`,
also in `openapi.json`). A validation failure is a 400 naming the part (`body`, `query`,
`params`) and the failing fields. Anything that is not an `AppError` leaves as a bare
`internal` envelope; its stack is logged with the `requestId` and never sent, nor is query
text or a secret. Log through `services/logger.ts`: one line per request, every unexpected
error with its stack, ids and never payloads, secret-looking keys redacted.
<!-- @database:postgres-start -->

Postgres errors are mapped in one place, `classifyPostgresError` in
`services/utils/postgres-error.ts`, which `middleware/error-handler.ts` calls before its
`internal` fallback. A connection that is refused, lost or timed out, and a server that is
starting, shutting down or out of connections, answer 503 `upstream_unavailable` with the
fixed message "the database is unavailable". A unique violation (SQLSTATE 23505) answers 409
`conflict` with "the record already exists", so a request that loses a race on a unique index
needs no `try` in the controller. Any other database error is `internal`. The driver's text,
the query, the detail and the constraint name stay in the server log.
<!-- @database:postgres-end -->

Every endpoint's test covers its validation failure and its not-found path, asserting the
envelope's `code` and `requestId`, not only the status.
A gated endpoint also tests its 401 and, where it checks a role, its 403. <!-- @auth -->

## Tests

- `bun test` with supertest against `app` from `server.ts`, never `index.ts` and never live
  infrastructure. One `tests/<name>.test.ts` per module; the rest mirror `src/`
  (`tests/middleware/`, `tests/services/`, `tests/infra/`, `tests/db/`).
- Time is driven with `setSystemTime`. An event's effect is asserted after `await drain()`.
  `beforeEach` resets the store with `resetStore()`.
- Messages are captured through a provider registered with `registerProvider`. <!-- @auth -->
- A suite that stores records, and any test that resets or inspects them, goes through the
  seam `tests/store.ts`: `describeStore` wraps the suite, `resetStore()` empties the store,
  `recordExists(collection, id)` and `deleteRecord(collection, id)` read and remove one record.
<!-- @nodatabase-start -->
  `describeStore` is `describe` here; the data-layer task rewrites the seam for the engine
  (see Adding the data layer).
<!-- @nodatabase-end -->
<!-- @database:postgres-start -->
  `describeStore` is `describe.skip` unless `DATABASE_URL` names a database ending in
  `_test`, so `bun run check` skips the store-backed suites and `bun run test:db` runs the
  whole suite against `app_test`. `resetStore()` truncates every table except
  `schema_migration`, clears the cache, and throws on a database whose name does not end in
  `_test`. A test that only Postgres can answer (a unique index, a transaction) lives in
  `tests/db/` under `describeStore`. The error classifier test is
  `tests/services/postgres-error.test.ts`, under a plain `describe`, and runs in `check`. A
  store reset hook (`beforeEach(resetStore)`) goes inside the `describeStore` block, never at
  file level: a file-level `resetStore` breaks `check` in this variant as soon as the file has a
  plain `describe`.
<!-- @database:postgres-end -->
- `tests/openapi.test.ts` fails on a stale `openapi.json`: run `bun run openapi`.
- Every new behaviour gets a happy-path test and at least one failure or empty-path test.
  No `.skip` and no `.only`; a removed test is named and justified in the stage report.
  `bun run check` never needs Docker.
