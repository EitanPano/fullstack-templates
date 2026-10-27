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

The contract of every frontend, server-rendered or SPA. The rationale and the tradeoffs are in
[ADR 0005](adr/0005-frontend-foundation.md); the shell and phone-project rules of
[ADR 0004](adr/0004-ui-baseline.md) that it keeps are marked below.

- **Layers.** Under `src/`: `app/` is routing only (route groups, layouts, pages, `loading` and
  `error` per group, `nav.ts`). `widget/<section>/` is a page section: it reads data and composes
  entities and features (`ui/<section>` and `ui/<section>-skeleton`). `feature/<action>/` is one
  user action (a glossary verb, or `auth`): `model.ts` (the form schema and its copy), the data
  layer, and `ui/`. `entity/<noun>/` is one glossary noun: `model.ts`, the read loaders, and
  presentational `ui/`. `shared/` is product-agnostic: `ui/` (shadcn primitives), `ui/form/`,
  `ui/pattern/`, `lib/`, `api/`, `auth/` and `config/env.ts`. The data layer is `server/` for a
  server-rendered framework and `api/` otherwise.
- **Import direction.** `app` imports widget, feature, entity, shared; `widget` imports feature,
  entity, shared; `feature` imports entity, shared; `entity` imports shared; `shared` imports
  shared. An entity imports another entity only with `import type` from its `model.ts`. No slice
  imports a sibling slice in its own layer. A `'use client'` file imports from `server/` only an
  `action.ts`. `shared/api` is imported only by a data layer and `shared/auth`, plus the types and
  generated zod schemas a `model.ts` extends. The language's tool enforces it (ESLint with
  `eslint-plugin-boundaries`), and each message names the layer to use instead.
- **Where an addition goes.** A domain object's type, mapper, label or card: `entity/<noun>/`. A
  read: the entity's data layer. A mutation and the control that runs it: `feature/<action>/`. A
  section that combines reads and actions: `widget/<section>/`. A route and its layout: `app/`. A
  primitive: `shared/ui/`, added with `shadcn add`. A layout pattern: `shared/ui/pattern/`. A
  form field binding: `shared/ui/form/`. Date and time helpers: `shared/lib/`. An environment
  variable: `shared/config/env.ts` and `.env.example`. A navigation entry: `app/nav.ts`.
- **Design system.** shadcn/ui on Radix, copied into `shared/ui/` (`components.json` maps `ui` to
  `@/shared/ui` and `utils` to `@/shared/lib/cn`). The CLI is pinned; `shadcn add <name>` is the
  one scaffolder an agent may run, and `shadcn init` is not. The `button`, `input`, `select` and
  `textarea` JSX elements are an error outside `shared/ui`. One toast library and one icon set per
  template; the same icon for the same concept. A toast fires from the handler after the await,
  never from an effect.
- **Tokens.** shadcn's semantic set in OKLCH plus `success`, `warning` and `info`, each with its
  `-foreground`, and `border`, `input`, `ring` and `radius`. Light values in `:root`, dark values
  in `.dark`, with `@custom-variant dark`. Components use the utilities, never a literal. Spacing
  is a 4 px base (Tailwind's default multiplier; steps 1, 2, 3, 4, 6, 8, 12, 16) and a template
  never adds a `--spacing-N` key (ADR 0004, U2). The generator derives the values from the brand
  inputs and checks their contrast.
- **Theme.** A class-based dark mode (`next-themes` in a server-rendered framework, a
  `ThemeProvider` in an SPA) with the default from the brand input and a toggle in the `UserMenu`.
- **Shell** (ADR 0004, U1; its path moved). `AppShell` in `shared/ui/pattern/` is composed by the
  root layout in `app/`: a skip link to `#main`, `<header>` with the display name linking to `/`
  and `<nav aria-label="Primary">` built from `app/nav.ts` (`NavEntry { to | href, label }`: `to`
  in react-router, `href` in `next/link`), an account slot, the page's one `<main id="main">`, and
  `<footer>`. The nav is inline from `md` and a Sheet on phones. A feature adds a nav entry and
  renders inside `main`; it never adds a second landmark set. The root layout passes the entries
  to the shell as props, so `shared/` never imports `app/`.
- **Mobile first.** Unprefixed utilities are the phone layout; `sm`, `md`, `lg` widen it; their
  pixel values are in the template's `AGENTS.md › Styling`. No horizontal overflow at any
  viewport. Controls are `h-11` under `pointer-coarse` (at least 44 x 44 px, an icon button
  included) and take the shadcn density on a fine pointer.
- **Contract client.** `contract` generates types, a fetch client and zod schemas into
  `shared/api/generated/` (committed, never edited). A form schema extends the generated request
  schema; a validation limit is never copied. The Next client runs on the server and never uses the
  generated singleton. It forwards no `X-Forwarded-For` unless the optional `CLIENT_IP_HEADER` names
  a header a trusted proxy sets ([ADR 0005](adr/0005-frontend-foundation.md), F14).
- **Mutations.** One action client with `action`, `accountAction` and `roleAction(role)`, and one
  `call` helper that maps an API result to data or to an `ActionError` through the feature's copy
  table, keyed by the envelope's `code`. Copy is ours; the server's text never reaches the user. A
  mutation names the entities it changes (`updateTag`, or a query key); `revalidatePath` is not
  used. In a SPA, `useMutation` with the same `call` and copy tables.
- **Forms.** React Hook Form with `zodResolver`; `shared/ui/form/` holds the field bindings. A
  field error shows on its field with `aria-invalid` and `aria-describedby`; the toast reports the
  outcome and never repeats it. A server field error for a path the form does not register becomes
  a toast. A Next form's submit ignores only Next's navigation errors (redirect, not-found) through
  a shared helper and rethrows anything else.
- **Reads.** A server-rendered framework caches a public read, tags it by entity and renders a
  data widget as a request-time hole (an async component in Suspense that awaits the request, then
  the cached loader); a per-user read is dynamic. A cached loader throws on failure and the widget
  renders `ErrorState`. An SPA reads with TanStack Query: loaders prefetch, widgets suspend,
  mutations invalidate.
- **Auth** (only when the server has auth). A data access layer (`readSession`, `requireAccount`,
  `requireRole`) does every real check; a Next proxy only refreshes tokens (it never redirects), and
  `requireRole` sends a wrong role to `/forbidden`. The `(auth)` and `(site)` route groups; a staff
  group guards its layout, its pages, its loaders and its actions. The `UserMenu` (avatar, email,
  theme, sign out) sits in the shell's account slot.
- **Errors and loading.** Every route has a `loading` and an `error` state, its own or its
  group's; every widget has a skeleton that matches its layout. A server-rendered framework adds
  a global error boundary.
- **Dates.** `shared/lib/date` converts a wall time to an instant and back in a named zone,
  computes day keys and formats dates. A time in a DST gap is refused and an ambiguous time takes
  the earlier instant.
- **Gates:** typecheck, lint, format, unit tests; e2e with an accessibility scan and no axe
  exclusion.
- **E2E** (ADR 0004, U4; amended). Playwright serves the production build (Next:
  `scripts/e2e-server.mjs`, which builds and runs the standalone `server.js`; SPA: `vite build` and
  `vite preview`) and starts the server fresh with `reuseExistingServer: false`,
  `RATE_LIMIT_SCALE=100` and the server's `start` command. With a database, the provider's `e2e` URL
  (`app_e2e`) goes to the server and the server's web server command is `e2eDb && start` (not a
  `globalSetup`: Playwright starts web servers first). `E2E_DATABASE_URL` overrides the URL, and the
  config refuses at load any URL whose database name does not end in `_e2e`. Generation fails closed
  without a server start command or, with a database, an `e2eDb` command and an `e2e` URL
  (CONTRIBUTING). With `E2E_BASE_URL` set (a blank value counts as unset) nothing is started (CONTRIBUTING). A check for one project carries `@phone` or `@desktop`, and the other project's `grepInvert` leaves it out; never a runtime `test.skip`. The development
  database is never touched. The `phone` project (`devices['Pixel 7']`, touch) runs every journey
  with its accessibility scan; the `desktop` project (`devices['Desktop Chrome']`) runs `shell.spec`
  and `screens.spec`. `retries: 0`, and a trace on failure. `tests/e2e/shell.spec.ts` asserts the
  landmarks, the skip link, no horizontal overflow, the 44 px targets on the touch project, the
  shadcn densities on the desktop project and that `data-density="compact"` does not shrink a touch
  target. `tests/e2e/screens.spec.ts` captures every `nav.ts` route, plus sign-in and sign-up when
  auth is on, on phone and desktop in light and dark, to
  `test-results/screens/<route>-<viewport>-<theme>.png`. A journey creates its data through the API
  with a name unique per run and removes it through the API once the product has a delete endpoint.
- **Unit tests** are Vitest with React Testing Library. The template tests its own glue once (the
  field bindings, the shell nav, `call`, the action client, theme toggling, the auth helpers).
- **Brand.** The generator takes `--display-name`, `--brand-primary`, `--brand-neutral`, `--radius`,
  `--font`, `--theme` and `--density`, recorded in provenance under `answers.brand`. Defaults: the
  project name in title case, `#1d4ed8` on a `#64748b` neutral, `md`, `system`, `system`,
  `comfortable`. The generator fails, naming the pair, when a seed cannot pass the contrast checks.
- **Cross-package selections.** A frontend template may gate files on the server's flags and
  capabilities with `onlyWhen: { "server:<name>": [paths] }`; every `server:*` selection is off
  when the frontend is generated alone ([capabilities](capabilities.md)).

**Frontend, single-page app**

The shape every SPA template (React now, Vue and Angular later) satisfies, on top of the
frontend contract above. The rationale is in [ADR 0003](adr/0003-spa-and-deploy-modes.md), with the
layers amended by [ADR 0005](adr/0005-frontend-foundation.md).

- `src/app/` is routing only: `routes.tsx` (the route table), a root `layout` and `not-found`,
  and per route group a `loading` (the hydrate and pending fallback) and an `error` (the route's
  error boundary). `src/main.tsx` mounts the router, the theme provider, the query client and the
  toaster and nothing else.
- The layers are the frontend's above, with `api/` as the data layer: `entity/<noun>/api/` holds
  query options and `feature/<action>/api/` holds mutation hooks. Only a data layer and
  `shared/auth` import `shared/api`; lint enforces it.
- There is no proxy. Route loaders guard routes (`requireAccount`, `requireRole`) and a
  `RequireRole` component hides controls. The client turns a 401 into one refresh and a retry, and
  concurrent refreshes collapse into one.
- Route loaders call `queryClient.query(...)` (fetch semantics, 30 s `staleTime`), never
  `ensureQueryData`, which the pinned TanStack Query deprecates.
- The no-flash theme script is the file `public/theme-init.js`, not an inline script: the deployed
  pages carry `script-src 'self'`.
- `shared/api/session-hint.ts` is a `localStorage` flag, never a token: set after sign-in, cleared
  on sign-out and on a refresh 400, 401 or 403 (a refresh without a cookie answers 400). The client refreshes only when it is set; without it the
  page shows the signed-out view.
- The generated query options are produced with `infiniteQueryOptions: false`: the template has no
  paginated endpoint.
- A client-side `noindex` is a known limitation: a crawler without JavaScript does not see it.
- The API is reached at relative `/api/*` on the page's own origin in every deploy mode. The dev
  server proxies `/api` to the server's port. No API URL is compiled into the bundle and CORS stays
  off. The client resolves the origin explicitly (`baseUrl: window.location.origin`). The client
  address is the browser's own (the dev proxy, nginx or the server sees it), so `CLIENT_IP_HEADER`
  does not apply to an SPA.
- `src/shared/config/env.ts` is the only reader of `import.meta.env` (lint), browser-visible
  values only, never a secret.
- `build` writes `dist/`: `index.html` at its root, hashed files under `dist/assets/`. The
  manifest declares `static: { out: dist }`; a frontend without `static` cannot be served by the
  server (`single`).
- E2E: with `E2E_BASE_URL` set, Playwright tests that URL and starts no web server; otherwise it
  builds and previews the app (`vite build`, `vite preview`) and starts the server fresh, with the
  same `e2eDb && start` chain as above.
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
| `start` | Run the server once, with no file watcher; a frontend's e2e starts the API with it. |
| `contract` | Server: write the OpenAPI document. Frontend: regenerate the typed client from it. |
| `migrate` | Apply schema migrations; added by a database capability overlay. |
| `e2eDb` | Prepare the e2e database (create if missing, migrate, truncate; refuses a name not ending in `_e2e`); added by a database capability overlay. |
