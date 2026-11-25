# Conventions

The language-neutral architecture contract every template of a kind satisfies, so an agent
(or a person) finds the same shape in any language. It is section D4 of
[ADR 0001](adr/0001-catalog-architecture.md), kept here as a standalone document.

What every template of a kind must satisfy, so an agent finds the same shape in any
language. The harness's backend layer map is the source; the contract is its
language-neutral core.

**Server**

- Two entry files: one that reads config, connects dependencies, listens and handles
  shutdown (`index` in TypeScript, `main` in Python), and one that builds the application
  without listening (`server`), so tests import the app and never start infrastructure.
- Directories: `config/` (env read once, constants, CORS, the route mount table),
  `api/<entity>/` (`routes` the router: the gates and one handler per endpoint, `controller`
  the business rules, the entity's only public API and its HTTP handlers, `schema` the leaf,
  `service` the entity's private queries, only when it has data of its own),
  `models/<name>/` (entity types), `middleware/`, `services/` (stateful shared
  capabilities; `security/`, `communicate/`, pure `utils/`), `infra/` (live connections
  as resources, `jobs/`, `subscribers/`, `scripts/`).
- Admin namespace ([ADR 0015](adr/0015-several-frontends-by-directory.md) A1): every admin
  endpoint is under `/api/admin/` and lives in `api/admin/<entity>/`, an entity like any other
  (`/api/admin/<entity>`, the entity singular). The namespace's `routes` mounts at `/api/admin`
  and applies the one gate first, the same in every environment: the role gate with accounts,
  a refusal of every request (403) without, until the product writes its own. No admin entity
  ships.
- SDK namespace ([ADR 0020](adr/0020-sdk-kind.md) N1 to N5, [ADR 0021](adr/0021-sdk-units.md) U8
  and U9), only with the `sdk` selection (the
  plan holds an SDK package, see **SDK** below; without one none of it is generated): every
  endpoint an SDK calls is under `/api/sdk/v1/` and lives in `api/sdk/<entity>/`, an entity like
  any other. The namespace's `routes` mounts at `/api/sdk/v1` and applies one gate first, the same
  in every environment, in this order:
  1. CORS for the namespace alone: the request's origin is echoed only when its key lists it;
     never `Access-Control-Allow-Credentials`; `x-sdk-key` and `content-type` allowed,
     `Access-Control-Max-Age: 600`. A preflight carries no key, so it is answered for an origin
     any key lists, and counted on the address limit first. The global `CORS_ORIGINS` layer
     passes every path under `/api/sdk/` through, so nothing else adds a cross-origin header
     there; the rest of the API is unchanged.
  2. The publishable key in the `X-Sdk-Key` header, resolved once to a record, `{ origins,
     enabled }` (403 for no key, an unknown key, an origin the key does not list and a key
     switched off, but for `GET` or `HEAD` of `config` itself). It identifies an integration
     and is not a secret. A lookup that fails answers the 500 envelope and is never read as a
     valid key. Only a request this step admits gets the allow-origin header of step 1.
  3. A rate limit `by_ip`, then by key (`sdkPerIp` 120 and `sdkPerKey` 3000 a minute at
     `RATE_LIMIT_SCALE` 1; 429): a request the address limit refuses never reaches the key's
     counter.

  Every answer of the namespace carries `Cache-Control: no-store` and `Vary: Origin, X-Sdk-Key`.
  A same-origin request (the SDK's frame calls the API from the API's own origin) needs a valid
  key only and gets no CORS header. `Sec-Fetch-Site` decides when the request has it (only
  `same-origin` counts); without it, a request with no `Origin`, or one whose host equals the
  request's `Host`, is same-origin. An entity only the frame calls (telemetry, or a write the
  host page must not make) is mounted behind the gate's `frameOnly` guard, which refuses what is
  not same-origin and answers its preflight with no allow header; an entity without it is
  readable by the host page, so it never issues or accepts anything that counts. A body under
  the namespace is at most 65,536 bytes (the 413 envelope), and the gate and the guard decide
  before a byte of it is read. No cookie is read. Within `v1` the
  namespace only adds (an endpoint, an optional request field, a response field); a removal or a
  change is a `v2` beside it. Errors, the request id and the log line are the server's own.
  - `GET /api/sdk/v1/config` answers `{ enabled }`: `SDK_ENABLED` (default `true`) and the
    key's own switch. It is the kill switch.
  - `POST /api/sdk/v1/telemetry`, frame only, takes `{ events }` (1 to 100 objects), answers 204
    and hands `{ key, events }` to `recordSdkTelemetry` in `services/telemetry`. The default
    logs a count; a product replaces the body. The sink is awaited; one that throws is logged
    by its class name and the answer is still 204: the frame sends on page hide and reads no
    answer. The namespace's limits count it; it has none of its own.
  - Two routes outside the gate, outside the OpenAPI document and not JSON, from the directory
    `SDK_DIR` names (unset, both answer the 404 envelope; a missing file never answers a
    frontend's page; the Worker takes the build in `assemble`, see **Serverless**): `GET|HEAD /api/sdk/dist/v<major>/<file>` serves only a name matching
    `^v[0-9]+/[A-Za-z0-9._-]+\.(js|css)$` (never `frame.html`), as JavaScript or CSS, with
    `Cache-Control: public, max-age=300`, `Cross-Origin-Resource-Policy: cross-origin`,
    `Access-Control-Allow-Origin: *`
    and `X-Content-Type-Options: nosniff`, an `ETag`, and 304 for a request that holds it; and
    `GET /api/sdk/frame/v<major>?k=<key>` answers
    `v<major>/frame.html` with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and one
    `Content-Security-Policy`: `default-src 'none'; script-src 'self'; style-src 'self'; img-src
    'self' <SDK_IMG_ORIGINS>; connect-src 'self'; base-uri 'none'; form-action 'none';
    frame-ancestors <the key's origins, or 'none'>` (`'none'` too for a key switched off, a
    failed lookup and a record holding an origin outside the form `SDK_KEYS` takes). No
    `X-Frame-Options`. `SDK_IMG_ORIGINS` lists the other origins a unit may
    draw an image from, in the form of an `SDK_KEYS` origin; unset, none.
  - `SDK_KEYS` holds the default resolver's pairs, `key=origin,origin` separated by `;`; unset or
    empty refuses every request, and a malformed value stops the start naming the variable and
    never a key. Production refuses an `http:` or loopback origin. A product replaces the
    resolver's bodies with a lookup once it has an entity for keys: both of its functions are
    asynchronous and answer from a cache, misses too, since the key step and the frame document
    run before any limit.
- Request flow: `config routes → entity routes → gates → controller handler → service →
  db seam → infra store`. The gates are what the framework runs before a handler (middleware
  in Express, dependencies in FastAPI): authentication, roles, rate limits. Validation comes
  from the schema through the framework's own mechanism. An entity's routes hold nothing but the
  gate chain and the handler per endpoint; the handler holds the endpoint's logic. Behaviour
  crosses entities only through rules a controller exports for that purpose, and an entity's
  service is never imported from outside it.
- Import direction enforced by the language's tool: ESLint zones (TypeScript),
  import-linter (Python), ArchUnit (Java), NetArchTest (.NET), deptrac (PHP). What the
  tool cannot express is listed in `AGENTS.md` as a review rule.
- Contract: OpenAPI 3.1 produced from the same schemas that validate requests (zod,
  pydantic, FluentValidation with Swashbuckle, Bean Validation with springdoc, Laravel
  form requests with Scramble). Singular resource paths under `/api/`, JSON only, one
  error envelope, a request id on every response. Only a 401 for a request with no valid access
  token carries `WWW-Authenticate: Bearer`; every other 401 (credentials, refresh token, code) none.
- Rate-limit subject: `by_ip` keys an IPv6 address by its /64 network and an IPv4 address by
  itself; an IPv4-mapped IPv6 address is its IPv4. One /64 is one subscriber, and keying the
  full address lets it rotate past any per-IP limit
  ([ADR 0004](adr/0004-ui-baseline.md), U6).
- `GET /api/health` (liveness, no store) and `GET /api/health/ready` (pings every
  resource, 503 with a per-dependency map).
- Config from environment variables only, read once, failing fast in production on a
  missing secret and defaulting elsewhere with a warning.
- Logging: one line per request (method, path without query, status, duration, request
  id), every unexpected error with its stack, secrets redacted.
- One Docker image, non-root user, port from env.
- File names follow the language (kebab-case in TypeScript, snake_case in Python, where a module
  name must be importable); the package's `AGENTS.md` states the form.

The per-language equivalents (the table every new server template is written against;
[ADR 0002](adr/0002-python-fastapi.md) fixes the python-fastapi column and its file mapping):

| Concern | bun-express | python-fastapi | dotnet-minimal-api | java-spring-boot | php-laravel |
| --- | --- | --- | --- | --- | --- |
| Validation + contract | zod, zod-to-openapi | pydantic, FastAPI's OpenAPI (shaped) | FluentValidation, Swashbuckle | Bean Validation, springdoc | Form requests, Scramble |
| Layer enforcement | ESLint import zones | import-linter | NetArchTest | ArchUnit | deptrac |
| Gates (`check`) | tsc, eslint, prettier, bun test | mypy, ruff, import-linter, pytest | dotnet build, format, test | mvn verify, spotless | phpstan, pint, pest |
| Env | zod-parsed `env.ts` | a pydantic model over `os.environ` (`env.py`) | `IOptions` + validation | `@ConfigurationProperties` | `config/` + env |
| Jobs / bus | croner, in-process bus | APScheduler 3, in-process bus | hosted services | `@Scheduled`, events | scheduler, events |

**Serverless** ([ADR 0014](adr/0014-astro-cloudflare-pages.md))

An API that runs as a provider's functions, in `serverless/<provider>/` with a project directory of
the same two segments. It satisfies the Server contract above except for the rows below, and it
keeps the layer map and import direction (lint zones), `api/<entity>/schema` as the leaf, the
OpenAPI 3.1 contract produced from the schemas, singular `/api/<entity>` paths, JSON only, the one
error envelope, a request id on every response, `by_ip`, both health endpoints, one log line per
request and the agents file's five server headings.

| Server contract | In a serverless template |
| --- | --- |
| Two entry files, a listener | One entry that only mounts each entity's `routes` (a route file is `gates → validate → controller`); tests send a request through the entry |
| One Docker image, `STATIC_DIR` | None: no image, no `compose.yaml` (refused), no deploy mode. `start` serves the frontends' builds on the Worker's origin when the plan has frontends that declare `static` |
| Jobs and the in-process bus | No bus; a scheduled job is a `scheduled` handler of the same Worker behind a flag |
| Config read once from environment variables | The same rule on the request's bindings, validated once per isolate; nothing reads `process.env` or keeps a module-level connection |
| The engine as a catalog provider | The engine is the platform's and part of the base: no `capabilities`; the template declares `migrate`, `testDb` and `e2eDb` itself |

- It is the plan's server for everything a frontend keys on: the `server` selection and
  `server:<flag>` facts, the `SERVER_*` placeholders, `contract: { consumes: "<server>/..." }`. A plan
  has at most one package of kind `server` or `serverless`.
- One Worker with static assets, routed by Hono ([ADR 0016](adr/0016-one-worker-with-static-assets.md)):
  one deployable that serves the API and every frontend's build, its entities able to move to a
  Worker each later (controllers async, plain data across an entity boundary).
- Its own placeholders for the frontends in the plan: `__FRONTEND_PATH__` and `__FRONTEND_OUT__`
  (the first frontend's directory path and `static.out`), `__FRONTENDS__` (a JSON list of
  `{dir,path,out,port}`, plus `fallback` for a single-page frontend, `[]` with no frontend) and `__FRONTEND_HOSTS__` (the local host map, empty
  then), with the `frontend` and `frontends` selections (`@frontend` / `@nofrontend`,
  `@frontends`); a line that uses `__FRONTEND_PATH__` or `__FRONTEND_OUT__` with no frontend fails
  generation.
- It may not declare `static`, `capabilities`, `onlyWhen` (but the one key `sdk`), `docker`,
  `withApp` or a brand case. It declares `start` (a frontend's e2e runs `e2eDb && start` in its
  directory).
- With an SDK package in the plan it ships the namespace of **Server** above, with these
  differences: `assemble` copies the SDK's build into `dist/api/sdk/` (`SDK_DIR` in its
  environment names another build; the frame document is stored without its `.html` name), and the
  Worker fetches it through `ASSETS` and builds the response from the body alone, so a `_headers`
  rule never reaches a served file. `SDK_KEYS` and `SDK_ENABLED` are bindings, set in `vars` per
  environment, and a malformed `SDK_KEYS` fails each request, naming the variable. A method the
  config path lacks answers 405 with `Allow`. `assemble` fails on a missing or empty SDK build,
  as on a missing frontend build; `start` only warns. The Worker has no global CORS layer.
- Command rows that differ: `start` serves the assembled sites and the API once on the
  manifest's port; `testDb` is the API project in the runtime; `migrate` and `e2eDb` act on the
  platform's local database and its separate e2e state, with no service to start.

**Frontend**

A plan may hold several frontends beside a `serverless` API, each in its own directory
([ADR 0015](adr/0015-several-frontends-by-directory.md)). Each uses the stack's own frontend
template, or one the stack's `stack.yaml` lists under `frontends`, taken only as one of several
([ADR 0017](adr/0017-another-frontend-template-beside-a-worker.md); `astro-cloudflare` lists
`frontend/angular`). A single-page template declares `static: { out, fallback }`: the Worker
answers a page path its build has no file for with that file. The generator accepts any valid
directory; the harness holds a new project's frontends to these four types:

| Directory | What it is | Search | Sign-in |
| --- | --- | --- | --- |
| `site` | Public pages: marketing, content, documentation | Indexed | None |
| `platform` | A public-first product with optional sign-in | Indexed | Optional |
| `app`, or `app-<tool>` when there are several | The signed-in customer product | noindex | Required |
| `admin` | The back-office for staff; calls `/api/admin/*` | noindex | Required, elevated |

What every frontend satisfies, whatever its framework. These ten invariants are numbered so the
harness can cite them. Folders, state, forms, the design system and the import graph are the
template's own: each template's `AGENTS.md` holds its layer map, its import rules with the lint
that enforces them, and where an addition goes. The rationale is in
[ADR 0006](adr/0006-per-framework-frontends-and-angular.md), which amends
[ADR 0005](adr/0005-frontend-foundation.md); the shell and phone rules of
[ADR 0004](adr/0004-ui-baseline.md) that it keeps are marked below.

1. **Contract types.** With a server, `contract` generates the types, the client and the zod
   schemas into a committed, never-edited directory the agents file names; a frontend generated
   without a server has no generated client and no `contract` command. No hand-written API types.
   A form schema derives from the generated request schema and never copies a validation limit.
2. **One origin.** The API is reached at relative `/api/*` on the page's origin in every deploy
   mode; with a server the dev server proxies it; no API URL is compiled in; CORS stays off. One env module is
   the only reader of build-time environment, browser-visible values only, never a secret. A
   server-rendered frontend forwards no `X-Forwarded-For` unless the optional `CLIENT_IP_HEADER`
   names a header a trusted proxy sets ([ADR 0005](adr/0005-frontend-foundation.md), F14).
3. **Errors and loading.** The envelope's `code` maps through the template's copy tables; the
   server's text never reaches the user; a toast fires from the handler after the await, never
   from an effect or an interceptor. Every route has a loading and an error state; every data
   section has a skeleton that matches its layout.
4. **Shell** (ADR 0010; amends ADR 0004 U1). A skip link to `#main`, first in the tab order, and
   the page's one `<main id="main">`, filling the rest of a viewport-high column; nothing else.
   Header, navigation, footer and the places of the theme toggle and the account menu are product
   code. `app/nav.ts` is the one table of top-level routes.
5. **Mobile first.** No horizontal overflow at any viewport. Controls are at least 44 x 44 px on
   a coarse pointer, icon buttons included; one component is the one place for a button.
6. **Brand and theme.** The generator's inputs (`--display-name`, `--brand-primary`,
   `--brand-neutral`, `--radius`, `--font`, `--theme`, `--density`), its contrast checks and its
   OKLCH token names are the one semantic set across frontends. Light values in `:root`, dark
   values under `[data-theme="dark"]`. Light, dark
   and system, the default from the brand input, a theme control the template ships and the
   product places (`AGENTS.md › Styling` names it). The no-flash theme script of a single-page
   template is a file, because its deployed pages carry `script-src 'self'`; the Next template
   uses `next-themes`' own script and ships no Content-Security-Policy. Spacing is a 4 px base and a
   template never adds a `--spacing-N` key (ADR 0004, U2). The inputs are recorded in
   provenance under `answers.brand`; defaults: the project name in title case, `#1d4ed8` on a
   `#64748b` neutral, `md`, `system`, `system`, `comfortable`. The generator fails, naming the
   pair, when a seed cannot pass the contrast checks; the primary is also link text, so it must
   read at 4.5:1 on the page, cards and popovers: the generator moves its lightness (hue and
   chroma kept) until it does and prints a `note:` line.
7. **Auth glue**, only with `server:auth`. Guards for account and role; `/forbidden` for a wrong
   role; a 401 becomes one refresh and a retry, and concurrent refreshes collapse into one; the
   session hint is a `localStorage` flag that is never a token, set after sign-in and cleared on
   sign-out and on a refresh 400, 401 or 403; an account menu component the product places
   (avatar, email and sign out), and Sign out on the profile page.
8. **Gates.** typecheck, lint, format and unit tests, without Docker. E2E on `phone` (`Pixel 7`,
   touch) and `desktop` (`Desktop Chrome`): `shell.spec` (skip link, one `main`, overflow,
   targets), `screens.spec` (every nav route plus the auth screens, both themes, axe WCAG A and
   AA, no horizontal scroll, one `h1`, `SIGNED_IN_ROUTES`), the auth journeys, `E2E_BASE_URL`,
   the `e2eDb && start` chain, `RATE_LIMIT_SCALE=100`, `retries: 0`. Unit tests of the template's
   own glue. A boundaries test that lints one violation and one allowed case per import rule
   through the real ESLint config, each message naming the layer to use instead. The e2e details
   are under **E2E** below.
9. **Shipping.** `static: { out }` with `index.html` at that root and content-hashed files; a
   Dockerfile with the `dist` and `serve` targets; the nginx config and its security-header
   snippet; a `compose.yaml` fragment per deploy mode; `onlyWhen` for the server's selections. A
   frontend with `docker: false` ships no image and has neither the Dockerfile nor the fragment:
   `static: { out }` with HTML at that root, served by a static host or by the plan's `serverless`
   package, and it joins a plan alone or beside a `serverless` package, never beside a `server`. A
   frontend template may gate files on the server's flags and capabilities with
   `onlyWhen: { "server:<name>": [paths] }`; every `server:*` selection is off when the frontend
   is generated alone ([capabilities](capabilities.md)).
10. **The agents file.** The headings `Adding a feature`, `Styling`, `Errors`, `Tests` and
    `Deployment`; the layer map; the import rules with the lint that enforces them; and under
    `Adding a feature` the recipe for a new entity, file by file. The recipe is documentation, as
    the server's `Adding an entity` is; a template never ships placeholder code, nor an example
    screen: the index route is one `h1` and one line of copy. `validate` checks the five headings;
    the layer map is not a checked heading. No step in the file tells a task to edit it: product
    facts go to this package's `.doc/` ([ADR 0019](adr/0019-package-docs.md)), and a bare `.doc/…`
    in template text is the repository's root folder.

**E2E** (ADR 0004, U4; amended). Playwright serves the production build and starts the server
fresh with `reuseExistingServer: false`, `RATE_LIMIT_SCALE=100` and the server's `start` command.
With a database, the provider's `e2e` URL (`app_e2e`) goes to the server and the server's web
server command is `e2eDb && start` (not a `globalSetup`: Playwright starts web servers first).
`E2E_DATABASE_URL` overrides the URL, and the config refuses at load any URL whose database name
does not end in `_e2e`. Generation fails closed without a server start command or, with a
database, an `e2eDb` command and an `e2e` URL (CONTRIBUTING). With `E2E_BASE_URL` set (a blank
value counts as unset) nothing is started (CONTRIBUTING). A check for one project carries
`@phone` or `@desktop`, and the other project's `grepInvert` leaves it out; never a runtime
`test.skip`. The development database is never touched. The `phone` project runs every journey
with its accessibility scan; the `desktop` project runs `shell.spec` and `screens.spec`.
`tests/e2e/shell.spec.ts` asserts the skip link, the one `main` reaching the viewport's bottom, no horizontal overflow, the 44 px
targets on the touch project, the density on the desktop project and that `data-density="compact"`
does not shrink a touch target. `tests/e2e/screens.spec.ts` captures every nav route, plus sign-in
and sign-up when auth is on, on phone and desktop in light and dark, to
`test-results/screens/<route>-<viewport>-<theme>.png`, and checks each screen (no axe violation of
the WCAG A and AA tags, no horizontal scroll, one `h1`); `SIGNED_IN_ROUTES` adds the screens only
an account sees. A journey creates its data through the API with a name unique per run and removes
it through the API once the product has a delete endpoint.

**Frontend, single-page app**

The SPA specifics of invariants 2, 8 and 9, for every SPA template (React, Angular and Vue; a
template's `AGENTS.md` holds its layer map). The rationale is in
[ADR 0003](adr/0003-spa-and-deploy-modes.md), with the layers moved to each template by
[ADR 0006](adr/0006-per-framework-frontends-and-angular.md).

- There is no proxy. Route guards run in the client (account and role), and the client turns a 401
  into one refresh and a retry; concurrent refreshes collapse into one.
- The no-flash theme script is the file `public/theme-init.js`, not an inline script: the deployed
  pages carry `script-src 'self'`.
- The session hint is a `localStorage` flag, never a token: set after sign-in, cleared on sign-out
  and on a refresh 400, 401 or 403 (a refresh without a cookie answers 400). The client refreshes
  only when it is set; without it the page shows the signed-out view.
- A client-side `noindex` is a known limitation: a crawler without JavaScript does not see it.
- With a server, the dev server proxies `/api` to its port. The client address is the browser's own (the
  dev proxy, nginx or the server sees it), so `CLIENT_IP_HEADER` does not apply to an SPA.
- `build` writes `dist/`: `index.html` at its root, content-hashed files beside it or under
  `dist/assets/`. The manifest declares `static: { out: dist }`; a frontend without `static`
  cannot be served by the server (`single`).
- E2E: with `E2E_BASE_URL` set, Playwright tests that URL and starts no web server; otherwise it
  serves the production build with the template's own static server and starts the server fresh,
  with the same `e2eDb && start` chain as above.
- The Dockerfile has two targets: `dist` (the built files only, at `/dist`) and the default
  `serve` (the `split` static server).

**SDK** ([ADR 0020](adr/0020-sdk-kind.md), [ADR 0021](adr/0021-sdk-units.md))

A library other sites load into their own pages: from a `<script>` tag or from npm. A host page
mounts a unit of one of its modules, by a call or by markup; the unit is drawn in a frame from
the API's origin and tells the page what happened. The base holds no module and no product's
vocabulary. It is a package of kind `sdk`, in
`sdk/<id>/`, and a plan holds at most one, added with `generate --sdk <dir>=<template>` beside a
`--stack` (an SDK has no API to call without one). The generator accepts any valid directory; the
harness holds a new project's to `sdk-<name>`, `<name>` a kebab-case term of the glossary.

- **Not a frontend.** None of the ten frontend invariants binds it, it has no brand case, and the
  rule that a `server` package takes one frontend does not count it. It calls the API from
  another origin, which is why invariant 2 (one origin, CORS off) does not apply to it.
- **Manifest.** `kind: sdk`; `cdn: { out }`, the directory its CDN build writes and the API
  package serves (required; never `static`); `contract: { consumes: "<server>/openapi.json" }`;
  `http: { port, health }` for its playground; a `compose.yaml` that is a build-only service. It
  may not declare `static`, `capabilities`, `onlyWhen`, `docker`, `withApp` or a brand case. No
  stack lists it. The command vocabulary below applies without `build`.
- **Layers.** `src/` holds `entries/` (the npm entry, the CDN loader, the frame's script, the
  two lists of modules), `core/` (init, config, the units and their slots, the events, the error
  boundary, consent), `transport/` (the host side's one request), `contract/` (generated types,
  committed, never edited), `protocol/` (the messages between loader and frame, with their
  version), `ui/` (the iframe, its handshake, the inline mount and the dialog), `frame/` (what
  runs inside the frame, its stylesheet's base and its helpers) and `modules/<name>/` (one
  feature each; none ships). Imports go `entries → modules → core | transport | contract |
  protocol | ui | frame`. The host half never imports `frame/`, the frame half never imports
  `ui/`, `transport/` or `core/`, both import `protocol/`, and a module never imports another
  module. The template's `AGENTS.md` holds the rules with the lint that enforces them, and a
  boundaries test lints one violation and one allowed case per rule.
- **Modules and units.** A module's host half is a declaration and no code (its name, the
  frame's title, `inline` or `modal`, the props a slot may carry); its frame half draws. A unit
  is one mounted instance. Data goes one way each: `props` in, a plain JSON object checked on
  both sides; `emit` out, reported to the page as `<module>:<event>`. What a module emits is
  seen by the host page, so nothing the server counts, no token and no server text goes there:
  the rule is the guide's and the review's, not the kernel's.
- **Contract.** Types only, for the operations under `/api/sdk/` only: no generated client, no
  `zod` schemas. `contract` refuses a server whose document has no `/api/sdk/` path and restores
  the committed types if the output names any other path.
- **Shipping.** `cdn.out` holds one folder per major of the package's own version:
  `v<major>/loader.js` (the IIFE loader), `v<major>/frame.js`, `v<major>/frame.css` and
  `v<major>/frame.html`. A
  Dockerfile with a `build` stage and a `dist` target (`FROM scratch`, the build at `/sdk`), and a
  Compose fragment with `build: { context, target: dist }` and `scale: 0`, the same in both deploy
  modes: the API package's image (or its `assemble`) reads it. No port, image or deploy mode of
  its own in production.

What every SDK template satisfies. These twelve invariants are numbered so the harness can cite
them; the rationale and the browser evidence are in ADR 0020 and ADR 0021.

1. **Three outputs, one source.** The npm entry (ESM, CJS and types, `sideEffects: false`,
   importable where there is no `window`, where `init` does nothing), the CDN loader (one IIFE,
   one global) and the frame's script and document. Gate: `publint` and are-the-types-wrong on the
   packed tarball, and three consumers (ESM, CJS, no DOM) installed from it.
2. **Good guest.** No runtime dependency; one global; no public call throws into the host (every
   entry point runs in the error boundary); `init` twice is one instance. Per unit the SDK adds a
   container and an iframe to the host page, and no style, markup or listener beyond them; the
   host side makes one request, the kill-switch read. One listener is the exception, for
   `DOMContentLoaded`, once, when the tag ran before the page was parsed. Only when asked: one
   observer for slots added later (`observe`), and for an open modal one dialog, `overflow` on
   `html` and one observer of the page's top-level children, all gone when it closes. No
   option, theme or declaration is read through a prototype. Gate: the e2e loads the built
   loader into a host fixture on another site than the API, under
   `default-src 'none'` with only the API's origin added to `script-src`, `connect-src` and
   `frame-src`, and asserts no policy violation, no uncaught error, no unhandled rejection, one
   new property on `window` and no listener the SDK added.
3. **A frame only where it may be.** The frame document is served with `frame-ancestors` naming
   the origins of the request's key and nothing else may frame it; the iframe carries
   `sandbox="allow-scripts allow-same-origin allow-forms allow-popups
   allow-popups-to-escape-sandbox"`, never a token that allows top navigation. A refused frame
   fires `load` and throws nothing, so the loader opens a handshake and, with no answer in time,
   removes the unit and reports `closed` with `timeout`; the wait starts at the frame's `load`,
   with a longer cap for one that never loads, and `load` and `error` are never read as
   answers. Gate: the e2e frames the document from a listed origin (the handshake completes) and
   from an unlisted one (the unit closes, nothing is thrown), and asserts the page can read
   nothing of the frame.
4. **What a module measures, it measures in the frame.** The kernel measures nothing. A helper
   for a frame half, `observeView`, answers once with the checks that ran (`occlusion: checked |
   unavailable`); what the module reports and what the server makes of it are theirs. Gate:
   the e2e hides the frame each way ADR 0020 F4 lists, through a fixture that uses the helper,
   and asserts no view where the engine can tell; unit tests of the rule.
5. **Size budget.** A number per output in the package (`package.json › sdk.sizeBudget`); `check`
   fails over it.
6. **One network door on each side.** Only `transport/` calls `fetch` on the host side and only
   the frame's sender inside the frame, each with a timeout, `credentials: 'omit'`, the key header
   and the default cache mode (`no-store` defeats the preflight cache). Gate: a lint zone.
7. **Untrusted strings.** Text from the server or the host reaches the DOM as text nodes and a
   link is https; no `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`, on either
   side. Gate: lint and unit tests.
8. **Consent first.** Nothing is sent as telemetry until the consent state allows it.
9. **Telemetry that arrives.** The frame's alone: a buffer drained on `visibilitychange` to
   hidden and on `pagehide` (which a closed unit's frame also gets), sent as JSON with
   `keepalive`. Never `sendBeacon` with a JSON body.
10. **Kill switch.** `init` reads `GET /api/sdk/v1/config`; `enabled: false`, a failed read and a
    slow read each leave the page untouched, with no frame created; a unit asked for meanwhile
    reports `closed` with `disabled`.
11. **The public surface is a contract, and so is the channel.** A committed API report
    (`etc/sdk.api.txt`); `check` fails when the surface and the report differ. The CDN global and
    the npm entry expose the same surface. `protocol/` only adds within a major: the loader's major
    is in the frame's address, and a loader installed long ago meets a frame served today.
12. **The agents file.** The headings `Adding a feature`, `Public API`, `Errors`, `Tests`,
    `Styling` and `Deployment`, matched exactly (`validate` checks them): a feature is a module;
    the layer map and the import rules with the lint that enforces them; under `Styling`, the
    frame's tokens and the rule that a module's sheet is scoped to it; under `Deployment`, what
    an integrator adds to their policy (`script-src`, `connect-src` and `frame-src` gain the
    API's origin, nothing for styles), the release steps and the recipe for old builds. No step
    in the file tells a task to edit it ([ADR 0019](adr/0019-package-docs.md)).

Gates: `check` runs typecheck, lint, format, unit tests, the build, the size budget, the API
report and the tarball lint and consumers, with no Docker and no browser; `testE2e` runs the
browser suite in Chromium, Firefox and WebKit against a fresh API package and two host servers,
and `screens.spec` on a phone and a desktop viewport: each unit listed in
`tests/e2e/unit-screens.ts`, light and dark, to
`test-results/screens/<name>-<viewport>-<theme>.png`, with an axe scan (WCAG A and AA) and no
horizontal overflow inside the frame.

**Deploy modes**

How a project with a server and a frontend ships. A plan whose API is `serverless` has no deploy mode and no Compose file. Chosen at generation with `--deploy`, recorded
in provenance (`deploy`), and moved later by a planned project change. Rationale and the rejected
alternatives: ADR 0003 (M5-4 to M5-7).

| | `single` | `split` |
| --- | --- | --- |
| Images | one: the server's, holding the API and the SPA's `dist/` | one per package |
| Public port | the server's | the frontend's (the server's is loopback only) |
| API reached by the browser | the same origin, the same process | the same origin, through the frontend image's `/api` proxy |
| `TRUST_PROXY` default | `false` (the server is the edge) | `1` (the frontend's proxy counts) |
| Frontend Compose service | build-only (`target: dist`, `scale: 0`, no ports): no container | yes, the `serve` target |

- **Defaults and refusals.** `single` is the default when the plan has a server and the frontend
  declares `static`; otherwise `split`. `--deploy single` with a frontend lacking `static`
  (Next), or with no server in the plan, fails and names the reason, as does an unknown value.
  With only a frontend or only a server the option is not written to provenance.
- **Static serving** is always shipped in a server template and inert unless `STATIC_DIR` is set.
  Only Dockerfile and Compose lines carry the mode, so the code is identical in both.
- **Reserved selection `single`.** Marker lines in `base/` and `compose.yaml` use `@single` and
  `@nosingle` (and the `-start`/`-end` forms). It is true in `single` and never true in a plan
  without a server. Manifests cannot declare a flag named `single`; `validate` dry-runs it on and
  off wherever `server` is true.
- **`__FRONTEND_DIR__`** is a package placeholder: the frontend's directory, used by the server's
  Compose fragment to reach the SPA's build.
- **Ports.** A frontend's `http.port` is its dev-server port, and in `split` its container's.
  In `single` the deployed app and the app smoke use the server's port.
- **`TRUST_PROXY`.** `false` in `single` and `1` in `split`, as defaults. Production sets the hop
  count of whatever sits in front; each template's `AGENTS.md › Deployment` says how.
- **Compose floor.** `single` needs Docker Compose 2.35.0 or later: the server's build reads the
  SPA's build through `additional_contexts: { spa: "service:<frontend dir>" }`. Older clients fail
  with a message that does not name the cause. `split` has no such floor, except in a project with
  an SDK: its server's build reads the SDK's through `additional_contexts: { sdk: "service:<sdk
  dir>" }` in both modes.
- **`docker compose down`** needs `--profile app` (or `COMPOSE_PROFILES=app`) to stop the
  application services, which carry that profile; without it they keep running.
- **Provenance** records the mode generated. `.doc/architecture.md › Deployment` in the project
  is the current mode and wins when they differ.
- **Not generated:** a static host (CDN) mode, because it needs CORS, cross-site cookies and a
  CSRF stance. See ADR 0003.

**Worker**

- The server layout without `api/` and `middleware/`: `config/`, `models/`, `services/`,
  `infra/` with the consumer loop under `infra/consumers/`. Pull-mode messaging. Health as
  a liveness file or a tiny HTTP endpoint, declared in the manifest.

## Commands

Every template's manifest maps this fixed vocabulary to the real command in its ecosystem.
The harness's agents say "run the package's `check` command"; they never spell the
language's own invocation. Only `check` is required.

| Command | What the harness expects |
| --- | --- |
| `install` | Install dependencies from the committed lockfile state. |
| `dev` | Start the development server with reload. |
| `check` | Run every gate (types, lint, format, unit tests) with no Docker. Exit 0 means done. |
| `typecheck` | The type gate alone. |
| `lint` | The lint gate alone, including the layer-boundary rules. |
| `format` | Rewrite files to the project's formatting. |
| `test` | Unit tests that need no infrastructure. |
| `testDb` | Tests that need a database; added by a database capability overlay, or declared by a serverless template. |
| `testE2e` | End-to-end tests with the accessibility scan; may start dev servers. An SDK's run in Chromium, Firefox and WebKit. |
| `start` | Run the server once, with no file watcher; a frontend's e2e starts the API with it. A serverless template also serves the frontend's build. |
| `contract` | Server: write the OpenAPI document. Frontend: regenerate the typed client from it; exists only with a server. SDK: regenerate the types of the `/api/sdk/` operations; refuses a server without them. |
| `migrate` | Apply schema migrations; added by a database capability overlay, or declared by a serverless template. |
| `e2eDb` | Prepare the e2e database (create if missing, migrate, truncate; refuses a name not ending in `_e2e`); added by a database capability overlay. A serverless template rebuilds its separate e2e state folder. |

`build` is not in the vocabulary: no tool or agent calls it. An SDK's build is its package script
`build`, which `check`, the Dockerfile's `build` stage and the `dist` target call; the API package
gets the output through the build-only Compose service (its image) or by `assemble` (the Worker),
never by a command of its own.
