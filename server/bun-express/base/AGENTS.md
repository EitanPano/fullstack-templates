# Backend

The layer map of `backend/`. What holds everywhere (versions, commands, definition of
done, and the conventions under `.claude/rules/`) is in the repository's `AGENTS.md`;
nothing here repeats them. This file ships with the package; an agent working in this directory loads it. The orchestrator and the reviewers read it explicitly, since their own
work does not touch those files. The `api-design` skill is the procedure for adding or
changing a module, the `database` skill for the data layer.

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
- Persistence: the template's only store is `infra/memory.ts` (records and key-values in
  process memory, a `Resource`). Every infrastructure dependency is a `Resource` from
  `infra/dependency.ts`, listed in `dependencies` in that file: connected at boot with
  bounded retry, pinged by `GET /api/health/ready`, closed on shutdown. Reconnecting after a
  drop is the driver's job. The data-layer task replaces `memory` with the chosen engine
  (`database` skill).

## Layer map

```
index.ts            env → connect dependencies → listen → shutdown; imported by nothing
server.ts           builds and exports `app`; never listens
openapi.ts          builds the OpenAPI document from config/routes.ts; `--write` emits it
config/             env.ts · constants.ts · cors.ts · routes.ts
api/<name>/         route · controller · schema; service · repository only when needed
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
  utils/            error · zod · openapi · pagination · time (pure, no I/O)
infra/              dependency.ts · memory.ts · scheduler.ts · pubsub.ts
  jobs/             one file per background job
  subscribers/      one file per event reaction
  scripts/          one-off commands (reserved: migrate, seed)
                    (reserved: <engine>.ts, redis.ts, the real connections)
```

- `index.ts` is the process entry and the only file that listens. It reads `config/env.ts`,
  connects `dependencies`, calls `app.listen`, binds `SIGTERM` and `SIGINT` to the shutdown
  from `infra/dependency.ts` (drain, close every resource, exit; 10 s cap) and warns once
  per defaulted secret.
- `server.ts` builds and exports `app`, nothing else: security and cross-cutting middleware
  first, then every module from `config/routes.ts` under the `/api` router, then `notFound`
  and `errorHandler` last. Tests import `app` and never start infra.
- `openapi.ts` builds the OpenAPI document from the same list; `bun run openapi` writes
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
  module list, one line per module: base path, route, OpenAPI registration.
- `api/<name>/`: one directory per module, singular name, mounted at `/api/<name>`. A module
<!-- @auth-start -->
  is a resource (`user`) or a capability (`auth`, `health`). A module has the files it needs:
  `service.ts` only with rules of its own, `repository.ts` only with data of its own (`health`
  and `auth` have no repository, `auth` has no `service.ts`).
<!-- @auth-end -->
<!-- @noauth-start -->
  is a resource or a capability (`health`). A module has the files it needs: `service.ts`
  only with rules of its own, `repository.ts` only with data of its own (`health` has no
  repository).
<!-- @noauth-end -->
  - `schema.ts`: zod request and response schemas and their OpenAPI registration. The leaf
    of the module.
  - `route.ts`: the HTTP adapter, an Express `Router`. Per endpoint it mounts the middleware
    that endpoint needs, validates with `validate()` into `res.locals.input`, calls one
<!-- @auth-start -->
    controller function and sends the status and body. Auth routes also set or clear
    cookies: cookies are transport, so they belong to the adapter.
<!-- @auth-end -->
<!-- @noauth-start -->
    controller function and sends the status and body.
<!-- @noauth-end -->
  - `controller.ts`: the module's public API. One exported function per operation with typed
    arguments and return values; no `req`, no `res`, no status code. Calls its own
    `service.ts` and, across a module boundary, another module's `controller.ts`.
  - `service.ts`: the module's private rules. Throws `AppError`, maps records to response
    shapes, owns transactions when the engine has them.
  - `repository.ts` (and `model.ts`): every query for the module, private to it; the only
    module files that import `services/db.ts` or `services/cache.ts`.
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
  `dependencies` list in connection order (`memory`, `pubsub`, `scheduler`), `connectAll`,
  `disconnectAll`, `healthCheck`, `withRetry` and `createShutdown`. `scheduler.ts` registers
  `jobs/`; `pubsub.ts` is the in-process bus and registers `subscribers/`; `scripts/`
  holds one-off commands.

## Where does X go

| You are adding… | It goes in | Shape |
| --- | --- | --- |
| A resource or capability with endpoints | `api/<name>/` | copy `api/module/`, rename `module`, `Module`, `MODULE`; one line in `config/routes.ts` |
| An entity's types | `models/<name>/` | copy `models/module/` |
| A limit on an entity's field | `models/<name>/constants.ts` | lengths, ranges, defaults of the data |
| A policy constant | `config/constants.ts` | durations, attempts, windows, cookie and header names | <!-- @auth -->
| A policy constant | `config/constants.ts` | durations, attempts, windows, header names | <!-- @noauth -->
| A request or response shape | `api/<name>/schema.ts` | zod; `satisfies` the `models/` type; OpenAPI registration |
| A rule about a module's own data | `api/<name>/service.ts` | throws `AppError`; private |
| A rule composing other modules and services | `api/<name>/controller.ts` | `api/auth/` is the example | <!-- @auth -->
| A rule composing other modules and services | `api/<name>/controller.ts` | calls each module's `controller.ts` | <!-- @noauth -->
| A query | `api/<name>/repository.ts` | `services/db.ts`, `services/cache.ts`; private |
| Something another module needs | `api/<name>/controller.ts` | the only cross-module import |
| Shared behaviour with state or I/O | `services/<name>.ts` | sessions, cache, events, logging | <!-- @auth -->
| Shared behaviour with state or I/O | `services/<name>.ts` | cache, events, logging | <!-- @noauth -->
| A vendor SDK wrapper | `services/<vendor>.ts` | thin; key from `config/env.ts`; the SDK is imported only here |
| A pure helper | `services/utils/<name>.ts` | no I/O, no state |
| A security primitive | `services/security/<name>.ts` | hashing, tokens, cookies, OTP | <!-- @auth -->
| A security primitive | `services/security/<name>.ts` | hashing, encryption, tokens | <!-- @noauth -->
| A way to reach a person | `services/communicate/<channel>.ts` | `Provider` type, console provider, env selection |
| A real provider for a channel | `services/<vendor>.ts` + a case in the channel file | `MAIL_PROVIDER=<vendor>` selects it |
| A message's wording | `services/communicate/templates/<name>.ts` | pure function → `{ subject?, text }` |
| Request handling endpoints share | `middleware/<name>.ts` | mounted in `route.ts`, or `server.ts` when cross-cutting |
| A live connection (database, cache, queue) | `infra/<store>.ts` | a `Resource` in `dependencies`; reached through `services/db.ts`, `cache.ts`, `event.ts` |
| A background job | `infra/jobs/<name>.ts` | `{ name, schedule, run }`; listed in `infra/scheduler.ts` |
| An event | `services/event.ts` | add it to the event map; `publish` from a service; handlers run detached, tests await `drain()` |
| A reaction to an event | `infra/subscribers/<name>.ts` | `{ topic, handle }`; listed in `infra/pubsub.ts` |
| A one-off command (migrate, seed) | `infra/scripts/<name>.ts` | `bun run src/infra/scripts/<name>.ts`; may call controllers |
| An environment variable | `config/env.ts` + `.env.example` | required in production, defaulted elsewhere |
| An allowed browser origin | `config/cors.ts` | set `CORS_ORIGINS`, only when a browser calls the API directly |

## Request flow

`config/routes.ts → api/<name>/route.ts → middleware → controller.ts → service.ts →
repository.ts → services/db.ts → infra/<store>.ts`. A route holds no logic beyond mounting
middleware, validating, resolving the caller, one controller call, cookies and the response. <!-- @auth -->
middleware, validating, one controller call and the response. <!-- @noauth -->

## Import direction

The leaves: `models/**` imports only `models/**`; `config/constants.ts` imports nothing;
`config/env.ts` imports zod only; `config/cors.ts` imports `config/env.ts`.

| File | May import | Never |
| --- | --- | --- |
| `config/routes.ts` | every module's `api/<m>/route.ts` and `schema.ts` | anything else |
| `openapi.ts` | `config/routes.ts`, `services/utils/` | anything else |
| `services/utils/**` | `models/`, `config/constants.ts`, `config/env.ts`, `services/utils/` | `infra/`, other `services/`, `api/`, `middleware/` |
| `services/db.ts`, `services/cache.ts` | `infra/memory.ts` (later the engine), `services/logger.ts`, `services/utils/`, `config/` (not `routes.ts`), `models/` | `api/`, `middleware/` |
| `services/event.ts` | `infra/pubsub.ts`, `services/logger.ts`, `services/utils/`, `models/` | `api/`, `middleware/` |
| other `services/**` | `services/**`, `models/`, `config/` (not `routes.ts`), `infra/dependency.ts` | `infra/` stores and bus, `api/`, `middleware/`, `server.ts`, `index.ts` |
| `middleware/**` | `services/**` except `services/db.ts`; `services/cache.ts` only from `rate-limit.ts`; `models/`, `config/` (not `routes.ts`) | `services/db.ts`, `api/`, `infra/` |
| `infra/**` | `infra/**`, `services/logger.ts`, `services/utils/`, `services/db.ts`, `services/cache.ts`, `services/session.ts`, `services/event.ts`, `config/` (not `routes.ts`), `models/` | `middleware/`, `server.ts`, `index.ts`, `api/` | <!-- @auth -->
| `infra/**` | `infra/**`, `services/logger.ts`, `services/utils/`, `services/db.ts`, `services/cache.ts`, `services/event.ts`, `config/` (not `routes.ts`), `models/` | `middleware/`, `server.ts`, `index.ts`, `api/` | <!-- @noauth -->
| `infra/jobs/**`, `infra/subscribers/**`, `infra/scripts/**` | the row above, `api/<m>/controller.ts`, types from `api/<m>/schema.ts`, any `services/**`; scripts also `api/<m>/model.ts` | `api/<m>/route.ts`, `service.ts`, `repository.ts` |
| `api/<m>/schema.ts` | `services/utils/`, `models/`, `config/constants.ts`, another module's `schema.ts` | everything else |
| `api/<m>/route.ts` | own `controller.ts` and `schema.ts`, `middleware/`, `services/utils/`, `services/security/cookies.ts`, `models/`, `config/constants.ts`, types from `infra/dependency.ts` | own `service.ts`, `repository.ts`, `model.ts`; any other module | <!-- @auth -->
| `api/<m>/route.ts` | own `controller.ts` and `schema.ts`, `middleware/`, `services/utils/`, `models/`, `config/constants.ts`, types from `infra/dependency.ts` | own `service.ts`, `repository.ts`, `model.ts`; any other module | <!-- @noauth -->
| `api/<m>/controller.ts` | own `service.ts` and `schema.ts`, other modules' `controller.ts` and `schema.ts`, `services/**` except `services/db.ts`, `services/cache.ts`, `services/event.ts`; `models/`, `config/` (not `routes.ts`), `infra/dependency.ts` | `express`, any `route.ts`, `repository.ts`, `model.ts` |
| `api/<m>/service.ts` | own `repository.ts`, `model.ts` and `schema.ts`, `services/**` except `services/db.ts`, `services/cache.ts`; `models/`, `config/` (not `routes.ts`), `infra/dependency.ts` | any `route.ts` or `controller.ts`; another module's anything but types |
| `api/<m>/repository.ts`, `model.ts` | `services/db.ts`, `services/cache.ts`, `services/logger.ts`, `services/utils/`, `models/`, `config/constants.ts`, own `model.ts` | `route.ts`, `controller.ts`, `service.ts`, `schema.ts` |
| `server.ts` | `middleware/`, `config/` (incl. `routes.ts`), `openapi.ts`, `services/logger.ts` | `api/` directly, `infra/` |
| `index.ts` | `config/env.ts`, `infra/dependency.ts`, `services/logger.ts`, `server.ts` | |

- `config/routes.ts` is imported only by `server.ts`, `openapi.ts` and tests; the other three
  `config/` files are open to every layer the table allows.
- `infra/dependency.ts` may be imported by anything except `models/`, `config/` and
  `services/utils/`; the health module reads `healthCheck` and `dependencies` as values,
  the rest import its types.
- `infra/memory.ts` (later `infra/<engine>.ts`, `infra/redis.ts`) is imported only by
  `services/db.ts`, `services/cache.ts` and `infra/**`; `infra/pubsub.ts` only by
  `services/event.ts` and `infra/**`.
- A module reaches a store only through `repository.ts` and `model.ts`; ESLint refuses
  `services/db.ts` and `services/cache.ts` in `route.ts`, `controller.ts`, `service.ts` and
  `schema.ts`. A file in `services/` may use them directly.
- Across modules: another module's `schema.ts` is imported as a type anywhere, as a value
<!-- @auth-start -->
  only by `controller.ts` and `schema.ts`; behaviour crosses only through `controller.ts`.
  A controller forwards the caller it received. A cross-module flow is not atomic: each
  controller call is its own unit of work; a flow that must be atomic lives in one module.
<!-- @auth-end -->
<!-- @noauth-start -->
  only by `controller.ts` and `schema.ts`; behaviour crosses only through `controller.ts`.
  A cross-module flow is not atomic: each controller call is its own unit of work; a flow
  that must be atomic lives in one module.
<!-- @noauth-end -->
- Nothing imports `index.ts`; only `index.ts` and tests import `server.ts`.
- Review rules, also not lintable: a vendor SDK package is imported only by its
  `services/<vendor>.ts`; a route holds no logic beyond the list in Request flow.

ESLint enforces the import rules: the leaves, the table's allowed and forbidden imports per
file, and the named import rules, except that it cannot tell a type import from a value import
<!-- @auth-start -->
of `infra/dependency.ts`. The behaviour statements (a controller forwards the caller, a
cross-module flow is not atomic, which module has a `service.ts`) and the two review rules are
review rules.
<!-- @auth-end -->
<!-- @noauth-start -->
of `infra/dependency.ts`. The behaviour statements (a cross-module flow is not atomic, which
module has a `service.ts`) and the two review rules are review rules.
<!-- @noauth-end -->

<!-- @auth-start -->
## Authentication

The template ships working auth (`api/auth/`, `api/user/`); a product starts from it. The
client, token, OTP and verification model is recorded in `.doc/architecture.md` (Auth) and
changes only by plan. The verify functions in `security/jwt.ts` return `null` for an
invalid or expired token.

- Where rules live. A module with its own data always has a `service.ts`. A capability
  module whose rules only compose other modules and services may have none, and then its
  controller holds the composition; `api/auth/` is the shipped example, and rules about
  user data (a blocked account) stay in the user module.
- Authorization. `requireAuth` and `requireRole` in `route.ts` are declarative and fail
  fast; the service remains the authority on the forwarded caller, so a cross-module call
  cannot bypass a route. Operations only other modules, jobs or scripts call take no
  caller and are named system operations: `createUser`, `verifyCredentials`,
  `findUserByTarget`, `getActiveUser`, `markVerified`, `setUserRole`. There is no admin
  bootstrap: the seed script calls `setUserRole`.
<!-- @auth-end -->
<!-- @noauth-start -->
## Authentication

This scaffold has no authentication (`--auth none`, recorded as `Auth: none` in
`.doc/architecture.md`): every endpoint is public and no module takes a caller. Adding
authentication later is a planned change, not a patch to one module.
<!-- @noauth-end -->

## The engine seam

`services/db.ts` and `services/cache.ts` are file seams, not type seams: each exports the
active store, and the type changes with the engine. The data-layer task rewrites `db.ts`,
<!-- @auth-start -->
every `repository.ts` and `services/session.ts`, adds `infra/<engine>.ts` and
`infra/scripts/migrate.ts`, and replaces `memory` in `dependencies`. The cache task
<!-- @auth-end -->
<!-- @noauth-start -->
every `repository.ts`, adds `infra/<engine>.ts` and `infra/scripts/migrate.ts`, and
replaces `memory` in `dependencies`. The cache task
<!-- @noauth-end -->
rewrites `cache.ts`, adds `infra/redis.ts` and gives `infra/pubsub.ts` its adapter
(`database` skill). Until then nothing survives a restart.

The layer map is language-neutral on purpose: the Python and .NET server templates mirror
the same directories and rules.
