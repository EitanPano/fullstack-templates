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

- `app/` (or the router's equivalent) is routing only. `feature/<name>/` holds `ui/`,
  the data access (`server/` for a server-rendered framework, `api/` otherwise) and
  `model.ts`. `shared/` is product-agnostic and never imports a feature. `lib/api/` holds
  the typed client generated from the server's contract and is imported only by a
  feature's data layer. Import direction `app → feature → shared, lib`.
- Gates: typecheck, lint, format, unit tests; e2e with an accessibility scan.
- Tokens as CSS variables; one toast library, one icon set per template. The five rules below
  apply to every frontend, server-rendered or SPA; the rationale is in
  [ADR 0004](adr/0004-ui-baseline.md).
- **Shell.** `shared/ui/app-shell` is composed by the root layout in `app/`: a skip link to
  `#main`, `<header>` with the project name linking to `/` and `<nav aria-label="Primary">` built
  from `app/nav.ts` (`NavEntry { to | href, label }`: `to` in react-router, `href` in `next/link`),
  the page's one `<main id="main">`, and `<footer>`. A feature adds a nav entry and renders
  inside `main`; it never adds a second landmark set. A product restyles the shell by plan; the
  landmarks, the skip link and one `main` stay. The root layout passes the nav entries to the
  shell as props, so `shared/` never imports `app/`.
- **Token scales.** The token file declares colour (`background`, `foreground`, `muted`,
  `muted-foreground`, `border`, `input`, `primary`, `primary-foreground`, `ring`, with a dark
  variant), type (`--text-sm`, `base`, `lg`, `xl`, `2xl`, with line heights), radius
  (`--radius-sm` 4 px, `md` 8 px, `lg` 12 px), and `--shadow-1`, `--shadow-2`, exposed to the
  utility layer. Spacing is a 4 px base (Tailwind's default multiplier in the current templates);
  steps 1, 2, 3, 4, 6, 8, 12, 16. A template never adds a `--spacing-N` key. A component uses a
  token, never a literal.
- **Mobile first.** Unprefixed utilities are the phone layout; `sm`, `md`, `lg` widen it;
  their pixel values are in the template's `AGENTS.md › Styling` (Tailwind's defaults today). No
  horizontal overflow at any viewport. Buttons, nav links and form controls are at least
  44 x 44 px; `shared/ui/button` is the one place for a button.
- **Phone e2e project.** The Playwright config has a `phone` project (`devices['Pixel 7']`,
  `screenshot: 'on'`) beside `chromium`. Every journey and the accessibility scan run on both.
  `tests/e2e/shell.spec.ts` asserts, on the phone project, the landmarks, the skip link, no
  horizontal overflow and the 44 px targets. The screenshots are the UX evidence QA reads.
- **E2E data.** With a database, the e2e server uses the development database: start it and
  migrate before `testE2e`. A journey creates its data through the API with a name unique per
  run, removes it through the API once the product has a delete endpoint, and never takes the
  database's contents as a precondition.

**Frontend, single-page app**

The shape every SPA template (React now, Vue and Angular later) satisfies, on top of the
frontend contract above. The rationale is in [ADR 0003](adr/0003-spa-and-deploy-modes.md).

- `src/app/` is routing only: `routes.tsx` (the route table), a root `layout` and `not-found`,
  and per route segment a `page`, a `loading` (the hydrate and pending fallback) and an `error`
  (the route's error boundary). `src/main.tsx` mounts the router and the toaster and nothing
  else.
- `src/feature/<name>/` holds `ui/`, `api/` (the route loaders and actions) and `model.ts`.
  Only `feature/*/api/` imports `lib/api/client`; lint enforces it. A feature never imports
  another feature's `ui/`.
- The API is reached at relative `/api/*` on the page's own origin in every deploy mode. The
  dev server proxies `/api` to the server's port. No API URL is compiled into the bundle and
  CORS stays off. The client resolves the origin explicitly
  (`baseUrl: window.location.origin`).
- `src/env.ts` is the only reader of `import.meta.env` (lint), browser-visible values only,
  never a secret.
- `build` writes `dist/`: `index.html` at its root, hashed files under `dist/assets/`. The
  manifest declares `static: { out: dist }`; a frontend without `static` cannot be served by the
  server (`single`).
- E2E: with `E2E_BASE_URL` set, Playwright tests that URL and starts no web server; otherwise it
  starts the server's dev command and the dev server.
- The Dockerfile has two targets: `dist` (the built files only, at `/dist`) and the default
  `serve` (the `split` static server).
- The agents file has the layer map and the headings `Adding a feature`, `Styling`, `Errors`,
  `Tests` and `Deployment`. `validate` checks these five headings, in any frontend template and
  not only an SPA; the layer map is not a checked heading.

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
| `contract` | Server: write the OpenAPI document. Frontend: regenerate the typed client from it. |
| `migrate` | Apply schema migrations; added by a database capability overlay. |
