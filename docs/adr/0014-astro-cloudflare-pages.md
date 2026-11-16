# ADR 0014: One package on Astro and Cloudflare Pages, and the `fullstack` kind

Status: accepted under the owner's delegation of 2026-11-16 ("set the astro-cloudflare to active,
do the commits, pushes and prs to dev on your own"). The six rulings in Context are his. The rows
marked ▲ are the session's, made from those rulings and the spikes, and stand for his review at
the `dev` → `main` merge; no separate acceptance was asked for before the build.
Built by harness plan 026 on `feat/astro-cloudflare`. Catalog release `v1.14.0`: the new kind
`fullstack`, its first template `fullstack/astro-cloudflare-pages` 1.0.0 and the one-package stack
`astro-cloudflare-pages`. No existing template changes. Amends
[ADR 0001](0001-catalog-architecture.md) (a fourth template kind; a stack of one package; a
template that declares `testDb`, `migrate` and `e2eDb` itself) and
[ADR 0003](0003-spa-and-deploy-modes.md) (a kind with no deploy mode and no Compose file).

## Context

- Every stack so far is a server package and a frontend package that ship as Docker images. A
  content site with a few endpoints wants neither a server to run nor two packages: pages a
  search engine reads as HTML, functions on the same origin, a hosted database.
- The owner asked for it on 2026-11-16 as "a new serverless stack: Astro + cloudflare pages
  functions", pasted the single-package tree he wants, and ruled the six questions of plan 026:

  | Question | Ruling |
  | --- | --- |
  | One package or two | One, as the pasted tree |
  | Workers with static assets, or Pages Functions | Pages Functions |
  | Sessions, refresh tokens and one-time codes | D1 tables; no KV binding in the base |
  | Island framework | React, behind an `islands` flag that is off by default |
  | Where the package sits | `app/` |
  | An Access gate when `auth` is off | No; the guide carries the recipe and the middleware slot |

- On 2026-11-17, with the server half built, he ruled accounts out of the template: "skip
  authentication in astro app". 1.0.0 has no `auth` flag (T6); the third ruling above then
  covers rate-limit counters only.
- The stack is also the target an existing Pages site migrates to: hand-written HTML, JavaScript
  Functions with their logic in a `_lib` folder, a D1 database migrated by hand, Git-connected
  builds. The template's guide carries that recipe; the migration itself is that site's own work.
- The catalog's tools assume a template is a `server` or a `frontend`: the loader demands a
  `compose.yaml`, the generator writes a `docker-compose.yml` and gives brand inputs only to a
  frontend, the case runner's app smoke is a Compose smoke, and the harness's write lanes are the
  constants `backend/` and `frontend/`.

## Decisions

The rows marked ▲ are the session's, made while writing this record from the six rulings and the
spikes; they stand for the owner's review at the `dev` → `main` merge.

### K1. The `fullstack` kind

- A fourth template kind, `fullstack`: one package that holds the pages, the server code and the
  schemas they share. Templates live under `fullstack/<id>/`; the default directory is `app`.
- A stack may have one package. `stacks/astro-cloudflare-pages` is
  `packages: [{ template: fullstack/astro-cloudflare-pages, dir: app }]`. `--template
  fullstack/<id>` and `--stack <id>` generate the same tree.
- ▲ A `fullstack` package never shares a plan with a `server` or a `frontend` package: the plan
  step refuses the mix and names both. It is the whole application.

### K2. What the kind keeps and what it drops

A `fullstack` template satisfies the Server contract for its server tree and the Frontend
invariants for its page tree (`docs/conventions.md`), except the rows below. Each dropped rule
names what stands in its place.

| Contract rule | In a `fullstack` template |
| --- | --- |
| Server: two entry files (`index`, `server`) | The platform routes; a route file is `parse → gates → controller → Response`. Tests send a request through the routing, never start a listener |
| Server: `api/<module>/routes` | The route files of the module; the gate chain is the first lines of each handler, built from `server/middleware/` |
| Server: `api/<module>/schema` | `shared/schemas/<module>.ts`: the request and response schemas both halves import |
| Server: OpenAPI 3.1 from the request schemas; Frontend 1: a generated client | No document and no generated client. `shared/` is the contract: the route validates with the schema the page's service types its call with. No `contract` command; the type check across `shared/` is the proof |
| Server: one Docker image; Frontend 9: Dockerfile, nginx config, Compose fragment, `static` | None. The platform's files ship instead: `wrangler.jsonc`, `public/_headers`, `public/_redirects`, `public/_routes.json` |
| Server: jobs and the in-process bus | No bus. A scheduled job is a second Worker under `workers/jobs/`, behind the `jobs` flag |
| Server: config from environment variables, read once | The same rule on the request's bindings: one env module validates `env` once per isolate; nothing reads `process.env` or keeps a module-level connection |
| Data engine as a catalog provider (`capabilities`) | The engine is the platform's and is part of the base. The template declares `migrate`, `testDb` and `e2eDb` itself and has no `capabilities` |
| Deploy modes (`single`, `split`) | None; provenance records no `deploy` |

Everything else holds: the layer map and import direction of the server tree with its lint
zones, singular `/api/<entity>` paths, JSON only, the one error envelope, a request id on every
response, the `WWW-Authenticate` rule, the `by_ip` /64 rule, `GET /api/health` and
`GET /api/health/ready`, one log line per request with secrets redacted, and Frontend invariants
2 to 8 and 10.

### K3. The manifest

- `kind: fullstack`; the schema's path patterns take `fullstack/`.
- ▲ **`lanes`** (required for this kind, refused for the others): which role writes which path of
  the package, because the harness's lanes are per package today and this package holds both
  halves.

  ```yaml
  lanes:
    backend: [functions, server, shared, migrations, wrangler.jsonc, package.json]
    frontend: [src, public, astro.config.mjs, package.json]
    qa: [tests]
  ```

  - The keys are `backend`, `frontend` and `qa`; a value is a list of paths inside the package. A
    path may sit in more than one lane (the dependency manifest, the lockfile, the shared
    configuration). The loader checks that every path exists in `base/`.
  - The generator records them per package in provenance as `packages.<dir>.lanes`, a directory
    with a trailing `/` and a file without, relative to the package. A path a flag removed is
    still recorded: the lane is where the role may write, not what exists.
- No `static`, no `contract`, no `capabilities`, no `onlyWhen` (there is no other package to key
  on; its own flags gate its files). The loader refuses each for this kind.
- `http` is the dev origin: the port `dev` serves pages and `/api` on, and the health path.

### K4. The loader

- No `compose.yaml` and no Dockerfile: the loader does not ask for one and refuses a
  `compose.yaml` beside a `fullstack` manifest.
- The agents file carries the server's headings and the frontend's: `Adding a module`,
  `Adding the data layer`, `Adding a feature`, `Styling`, `Errors`, `Tests`, `Deployment`.
- A `fullstack` template needs a brand case, as a frontend does.

### K5. The generator

- No `docker-compose.yml`, no deploy mode, no `SERVER_*` placeholder.
- The brand inputs, their placeholders and the contrast checks apply as they do to a frontend
  (invariant 6); provenance records `answers.brand`.
- ▲ Markers: `.jsonc` takes `//` markers. An `.astro` file takes `//` markers in its frontmatter
  and `<!-- -->` markers in its markup, in one pass.
- ▲ A path may be listed under more than one flag's `onlyPaths`; it exists while every flag that
  lists it is on. That is how a file that needs two flags is written.
- A `cloudflare` gitignore section in `shared/gitignore/`.
- A generation stays a function of its recorded selection (ADR 0011, D4).

### K6. The case runner

- A `fullstack` case runs `install`, `check`, `testDb`, and with `--e2e` the e2e suite. It starts
  no service and has no app smoke: `withApp` is refused in its cases file, and `--with-services`
  and `--with-app` skip it.
- Docker is never needed. The case runs with `docker` off the `PATH`.

### T1. The package `fullstack/astro-cloudflare-pages`

```
app/
├── src/                 Astro, output: 'static', no adapter            lane: frontend
│   ├── pages/           index · 404
│   ├── layouts/         the base layout: head, skip link, one <main id="main">
│   ├── components/      ui/ (the kit) · islands/ (with the islands flag)
│   ├── services/        api.ts · validation.ts
│   └── styles/          setup/ · themes/ · basics/
├── public/              _routes.json · _headers · _redirects · theme-init.js   lane: frontend
├── functions/           file path = route                              lane: backend
│   ├── _middleware.ts   request id · request log · error handler · response headers
│   └── api/             health · module/ (the reference module)
├── server/              never routed; imported by functions/ and workers/     lane: backend
│   ├── api/<module>/    controller · service · model (the Drizzle table)
│   ├── config/          env.ts · constants.ts
│   ├── middleware/      handler · validate · rate-limit · error-handler
│   ├── models/<name>/   interface · type · enum · constants
│   ├── services/        logger · security/ · utils/
│   └── infra/           bindings.ts · db.ts
├── shared/              schemas/ (zod, one file per module) · types/api.ts    lane: backend
├── workers/jobs/        with the jobs flag                             lane: backend
├── migrations/          SQL from drizzle-kit                           lane: backend
├── scripts/             dev · start · e2e-db · csp-headers             lane: both
├── tests/               api/ (workerd) · unit/ · e2e/ (Playwright)     lane: qa, and each owner
└── astro.config.mjs · wrangler.jsonc · worker-configuration.d.ts · drizzle.config.ts ·
    tsconfig.json · tsconfig.server.json · eslint.config.mjs · package.json · .env.example ·
    AGENTS.md
```

- The pasted tree, with the changes plan 026 lists: singular `user`, kebab-case files, `model.ts`
  for the table, D1 where the tree had KV, no product integration (Anthropic, Twilio, storage,
  queue), the index route as one `h1`.
- `src/` imports `shared/` and nothing of `server/` or `functions/`; `server/` and `functions/`
  never import `src/`; `shared/` imports none of the three. An ESLint zone refuses each, in
  `.ts` files and in `.astro` frontmatter, and a boundary test lints one violation and one
  allowed case per rule.
- ▲ The one path alias is `@shared/*`. `functions/` and `server/` import each other by relative
  path: the platform's function bundler resolves aliases from the root `tsconfig.json` only, and
  an alias declared there would make `@server/*` type-valid in `src/` (S5).

### T2. One origin

- `astro build` writes `dist/`; Pages serves it and the functions on one origin. ▲
  `build.format: 'file'`: the default directory format makes Pages answer `/page` with a 308 to
  `/page/` (S1).
- `public/_routes.json` includes `/api/*` only, so a static page invokes no Function. A function
  route outside `/api` adds its own line.
- `dev` is one dependency-free script: Astro's dev server with `/api` proxied to
  `wrangler pages dev`, both started and stopped together. `start` is `wrangler pages dev dist`
  once, on the e2e state folder (T7). Neither needs an account.

### T3. Request flow

`functions/_middleware.ts → route file → gates → validate → controller → service → Drizzle →
D1`.

- The root middleware gives every API response a request id, one log line (method, path without
  query, status, duration, request id), the error envelope for a thrown error, and the security
  headers: ▲ `public/_headers` covers static files only, never a Function's response (S1).
- A route file exports `onRequest<Method>` and holds the gate chain and the call to the
  controller, nothing else. The controller is the module's public API; its service and its model
  are private to it.
- `server/` uses the web platform's `Request` and `Response` and the bindings it is handed. It
  imports no Pages type, so a move to Workers replaces `functions/` and `_routes.json` only.

### T4. Configuration and bindings

- `server/config/env.ts` validates the request's `env` with zod, once per isolate. It fails in
  production on a missing secret and defaults elsewhere with a warning. Nothing reads
  `process.env`; no connection is kept at module level.
- ▲ `wrangler.jsonc` sets `ENVIRONMENT`: `development` at the top level (what local runs read),
  `preview` and `production` in the two environments. `env.preview` names its own D1 database,
  so a preview build never reads or writes production data. No secret is in the file.
- `.env.example` lists every variable. A local override goes in `.env`, which
  `wrangler pages dev` reads (S6). ▲ The template ships no `.dev.vars` and tells the reader not
  to create one: where it exists, `.env` is ignored whole.
- Production secrets are set by a person, in the dashboard or with `wrangler secret`. No agent
  and no script of the template deploys or reaches a remote binding.

### T5. Data

- D1 through Drizzle. A table is `server/api/<module>/model.ts`; `drizzle-kit generate` writes
  SQL into `migrations/`; `migrate` applies it to the local database.
- D1 has no interactive transaction. A rule that must not race is one conditional statement
  (`UPDATE … WHERE … RETURNING`, an upsert) or one batch.
- Rate-limit counters are a table, hit by one upsert per check.
- The guide's baseline recipe records the migrations of a hand-migrated database as applied
  without running them (S8).

### T6. No accounts in 1.0.0

- The owner's ruling of 2026-11-17. The template has no `auth` flag, no account, session or
  one-time-code table, and no sign-in page. Every endpoint is public; D1, its migrations and
  the rate limit are there.
- The gate chain takes a product's own gate (T3). The guide shows where it goes; the reference
  site sits behind Cloudflare Access. The template ships none.
- Accounts are a later plan. What this record learned for it: the auth surface to port is
  `server/bun-express`'s; rotation and attempt counters must each be one conditional statement
  (T5); and S3's measurements, which point at scrypt with N = 2^14, r = 8, p = 5 (16 MiB,
  about 200 ms locally) rather than OWASP's first set, which needs an isolate's whole memory.
  None of it is proven on a deployed project.

### T7. Gates and tests

- Two TypeScript projects: the root one (Astro's, `src/` and `shared/` with DOM types) and
  `tsconfig.server.json` (`functions/`, `server/`, `shared/` with the runtime's types from
  `wrangler types`, no DOM, `allowJs`). `shared/` is checked under both. ▲ TypeScript is pinned
  to 6: `astro check` refuses 7 (S5).
- `check`: the `wrangler types` freshness check, `astro check`, the server `tsc`, ESLint,
  Prettier and `test`. ▲ `test` runs every vitest project; `testDb` runs the API project alone.
  Both are in `check`'s reach without Docker, so `check` leaves only the e2e suite unrun.
- The API tests run in `workerd`: a request goes through the platform's real routing and the
  middleware, against a D1 with the migrations applied. ▲ Storage is isolated per test file, not
  per test, so the suite's setup empties every table before each test (S2).
- E2E: Playwright on `phone` and `desktop` against `start`. `e2eDb` rebuilds a separate state
  folder that `start` reads and `dev` never does (S7), so a journey never touches development
  data.

### T8. Pages

- Frontend invariants 2 to 8 and 10 hold: the shell (a skip link and one `main`), mobile first,
  the brand inputs and tokens, copy tables for the envelope's codes, the boundary test,
  `shell.spec` and `screens.spec`. Invariant 7 (auth glue) has nothing to apply to (T6).
- A page ships no script but the theme file unless it needs one. Behaviour is a `<script>` in
  the page, which Astro bundles; no UI framework is in the base.
- ▲ **Content-Security-Policy with no `'unsafe-inline'`**: Astro's `security.csp` hashes every
  script and style of the build; a post-build script moves the policy from the pages' `<meta>`
  into `dist/_headers` and adds `default-src`, `frame-ancestors`, `base-uri` and `object-src`
  (S4). The theme script stays a file.
- A static page cannot be gated on the server. The guide says no private content is ever
  written into a page at build time: a page for a signed-in visitor is a shell that fetches.

### T9. Flags

| Flag | Default | Adds |
| --- | --- | --- |
| `jobs` | off | `workers/jobs/`: a second Worker with its own `wrangler.jsonc` and one scheduled handler that imports `server/` (the cleanup of expired rate-limit rows) |
| `islands` | off | `@astrojs/react` and the `src/components/islands/` convention. ▲ It ships no island: the template has no example code (ADR 0010) and, without accounts, no form that needs one |

### T10. The guide

`AGENTS.md` carries K4's headings, plus `Adding a content page` and `Migrating a Pages site`.
The second maps each trait of a hand-written Pages site to its place here: stamped HTML to
layouts and content collections; `_redirects`, `_headers`, `404.html`, `robots.txt` and
generated text files to `public/` or an Astro endpoint; `_lib` logic to `server/` with
TypeScript adopted file by file; function routes outside `/api`; other bindings (Workers AI, a
service binding, `ASSETS`); an Access-gated admin; the baseline of a
hand-migrated database; a preview environment on its own database as step one.

### H. The harness (plan 026, H1 to H3)

- `verify` runs `testDb`, `migrate` and `e2eDb` without Docker when the project has a
  `fullstack` package.
- The write-lane hook adds the lanes provenance records to its constants, confined to the
  package and failing closed to the constants.
- A sub-agent's `wrangler` is an allowlist of local subcommands; the main session is asked
  before a command that reaches the platform; `.dev.vars` and wrangler's login file are secret.
- In a one-package project the implementers run in sequence, backend first.

## Spikes (2026-11-16, Windows 11, no account)

| Spike | Verdict | Finding the template carries |
| --- | --- | --- |
| S1 one origin | pass | `wrangler pages dev dist` serves pages, the 404, `_headers`, `_redirects` and functions on one port; `build.format: 'file'`; the dev proxy targets `127.0.0.1` |
| S2 tests in `workerd` | pass | `@cloudflare/vitest-plugin` (the renamed pool) on vitest 4.1; the functions are built once per run and tests call the built worker; isolation is per file |
| S3 password hash | partial | Not used in 1.0.0 (T6). scrypt N = 2^17 needs the whole isolate's memory; N = 2^14, p = 5 fits; production limits not testable here |
| S4 CSP | pass | hashed `script-src` and `style-src`, no `'unsafe-inline'`, an island hydrates; delivered from `dist/_headers` |
| S5 two type worlds | pass | two projects; TypeScript 6; zones plus a specifier ban for the alias; `@shared/*` only |
| S6 env file | pass | `.env` alone reaches `context.env`; a `.dev.vars` hides it; `.env.<environment>` is not read |
| S7 e2e data | pass | `--persist-to` on `migrations apply`, `execute` and `pages dev` share one layout; dev and e2e state never meet |
| S8 baseline | pass | create `d1_migrations` if absent, insert the applied file names, then `migrations apply` runs only the new ones |

Versions the spikes ran: astro 7.4.12, wrangler 4.163.0, `@astrojs/react` 7.1.9, react 19.3.1,
vitest 4.1.12, `@cloudflare/vitest-plugin` 1.8.3, drizzle-orm 0.45.4, drizzle-kit 0.31.11, zod
4.6.7, eslint 10.15.0, `@playwright/test` 1.65.1.

## Alternatives considered

- **Two packages** (`frontend/astro` and `server/cloudflare-functions`). It keeps the harness's
  lanes and the parallel implementer stage, and the catalog's two kinds. Pages builds one
  directory with `functions/` at its root, so the split would need a build step that folds one
  package into the other, and the shared schemas would need a third home. Recommended by the
  session, rejected by the owner for the pasted tree.
- **Workers with static assets.** It is where the platform's new features land. The reference
  site is a Git-connected Pages project, so Pages Functions is the smaller move. Only
  `functions/` and `_routes.json` are Pages-specific; `server/` does not import a Pages type.
- **Server-rendered Astro on the Cloudflare adapter.** One build instead of two halves, and
  endpoints as Astro routes. It makes every page a Function invocation and ties the server code
  to Astro's request types. Rejected: the pages are content, and static output has no runtime.
- **KV for sessions and one-time codes.** Eventually consistent (a revoked session can stay
  valid elsewhere for up to a minute) and no atomic increment, so rotation and attempt counters
  race. Rejected for D1, which is already bound.
- **An OpenAPI document generated from the zod schemas.** Nothing would consume it: the page
  imports the schema itself. Rejected until a second client exists.

## Consequences

- The catalog has a kind whose templates need no Docker anywhere: generation, gates, e2e.
- The harness reads a package's lanes from provenance; its role agents run in sequence in a
  one-package project, because `check` is package-wide.
- A second hosted one-package template (another platform, another page framework) is a new
  template under `fullstack/`, not a new kind.
- The catalog's contracts now have a column of exceptions (K2) that a reviewer must hold a
  `fullstack` template against.

## Out of scope

The reference site's migration. Accounts (T6). KV, R2 and Queue helpers; product integrations. Server-rendered
Astro and view transitions. A move to Workers with static assets. Adding or removing the
`fullstack` package of an existing project by `scaffold` (flags on it are in scope).
