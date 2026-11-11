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
  `api/<module>/` (`routes` the router: the gates and one handler per endpoint, `controller`
  the business rules, the module's only public API and its HTTP handlers, `schema` the leaf,
  `service` the module's private queries, only when it has data of its own),
  `models/<name>/` (entity types), `middleware/`, `services/` (stateful shared
  capabilities; `security/`, `communicate/`, pure `utils/`), `infra/` (live connections
  as resources, `jobs/`, `subscribers/`, `scripts/`).
- Request flow: `config routes → module routes → gates → controller handler → service →
  db seam → infra store`. The gates are what the framework runs before a handler (middleware
  in Express, dependencies in FastAPI): authentication, roles, rate limits. Validation comes
  from the schema through the framework's own mechanism. A module's routes hold nothing but the
  gate chain and the handler per endpoint; the handler holds the endpoint's logic. Behaviour
  crosses modules only through rules a controller exports for that purpose, and a module's
  service is never imported from outside it.
- Import direction enforced by the language's tool: ESLint zones (TypeScript),
  import-linter (Python), ArchUnit (Java), NetArchTest (.NET), deptrac (PHP). What the
  tool cannot express is listed in `AGENTS.md` as a review rule.
- Contract: OpenAPI 3.1 produced from the same schemas that validate requests (zod,
  pydantic, FluentValidation with Swashbuckle, Bean Validation with springdoc, Laravel
  form requests with Scramble). Singular resource paths under `/api/`, JSON only, one
  error envelope, a request id on every response.
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

**Frontend**

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
   values under a selector the template declares (`.dark` or `[data-theme="dark"]`). Light, dark
   and system, the default from the brand input, a theme control the template ships and the
   product places (`AGENTS.md › Styling` names it). The no-flash theme script is a file,
   never inline: the deployed pages carry `script-src 'self'`. Spacing is a 4 px base and a
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
   frontend template may gate files on the server's flags and capabilities with
   `onlyWhen: { "server:<name>": [paths] }`; every `server:*` selection is off when the frontend
   is generated alone ([capabilities](capabilities.md)).
10. **The agents file.** The headings `Adding a feature`, `Styling`, `Errors`, `Tests` and
    `Deployment`; the layer map; the import rules with the lint that enforces them; and under
    `Adding a feature` the recipe for a new module, file by file. The recipe is documentation, as
    the server's `Adding a module` is; a template never ships placeholder code, nor an example
    screen: the index route is one `h1` and one line of copy. `validate` checks the five headings;
    the layer map is not a checked heading.

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

**Deploy modes**

How a project with a server and a frontend ships. Chosen at generation with `--deploy`, recorded
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
  with a message that does not name the cause. `split` has no such floor.
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
| `testDb` | Tests that need a database; added by a database capability overlay. |
| `testE2e` | End-to-end tests with the accessibility scan; may start dev servers. |
| `start` | Run the server once, with no file watcher; a frontend's e2e starts the API with it. |
| `contract` | Server: write the OpenAPI document. Frontend: regenerate the typed client from it; exists only with a server. |
| `migrate` | Apply schema migrations; added by a database capability overlay. |
| `e2eDb` | Prepare the e2e database (create if missing, migrate, truncate; refuses a name not ending in `_e2e`); added by a database capability overlay. |
