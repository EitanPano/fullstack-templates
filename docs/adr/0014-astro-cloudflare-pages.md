# ADR 0014: An Astro frontend, Cloudflare serverless functions, and the `serverless` kind

Status: accepted under the owner's delegation of 2026-11-16 ("set the astro-cloudflare to active,
do the commits, pushes and prs to dev on your own"). The rulings in Context are his. The rows
marked ▲ are the session's, made from those rulings and the spikes, and stand for his review at
the `dev` → `main` merge.
Built by harness plan 026 on `feat/astro-cloudflare`. Catalog release `v1.14.0`: the new template
`frontend/astro` 1.0.0, the new kind `serverless` with its first template `serverless/cloudflare`
1.0.0, and the stack `astro-cloudflare`. No existing template changes. Amends
[ADR 0001](0001-catalog-architecture.md) (a fourth template kind; a package directory of two
segments; a template that declares `testDb`, `migrate` and `e2eDb` itself),
[ADR 0003](0003-spa-and-deploy-modes.md) (a kind with no deploy mode and no Compose file; a
frontend that ships no image) and [ADR 0006](0006-per-framework-frontends-and-angular.md)
(invariant 9 for a frontend with `docker: false`).

## Context

- Every stack so far is a server and a frontend that ship as Docker images. A content site with
  a few endpoints wants pages a search engine reads as HTML, functions on the same origin and a
  hosted database, with no server to run.
- The owner asked for it on 2026-11-16 as "a new serverless stack: Astro + cloudflare pages
  functions". His rulings, in order:

  | Date | Ruling |
  | --- | --- |
  | 2026-11-16 | Pages Functions, not Workers with static assets |
  | 2026-11-16 | Persistent server state in D1; no KV binding in the base |
  | 2026-11-16 | Islands on React, behind an `islands` flag that is off by default |
  | 2026-11-16 | No Access gate in the template; the guide carries the recipe |
  | 2026-11-17 | No accounts: "skip authentication in astro app" |
  | 2026-11-17 | **Two packages.** "put Astro frontend related folders and files inside the `frontend` folder and put the serverless functions and their related folders and files in a new `serverless` folder under `cloudflare` (since cloud functions are optional and multiple serverless providers exist). creating an astro app or migrating into astro should work properly." |
  | 2026-11-17 | The functions' project path is `serverless/cloudflare/` |
  | 2026-11-17 | The frontend gets the API's types from the OpenAPI contract, as every other frontend does |

- The first build (2026-11-16) put both halves in one package under a `fullstack` kind, on his
  ruling of that day. The two-package ruling replaces it: the `fullstack` kind and the shared
  schema folder are gone, and what was built moved into the two templates below.
- The stack is also the target an existing Pages site migrates to: hand-written HTML, JavaScript
  Functions with their logic in a `_lib` folder, a D1 database migrated by hand, Git-connected
  builds. The guides carry that recipe; the migration itself is that site's own work.

## Decisions

### K1. The `serverless` kind

- A fourth template kind: an API that runs as a provider's functions, with no process to keep
  up and no image to build. Templates live under `serverless/<provider>/`.
- ▲ **Its project directory is the same two segments**, `serverless/<provider>`: a stack's `dir`
  and a provenance package key may be `<segment>/<segment>`. Every other package stays one
  segment. A second provider is a sibling directory, never a rename.
- A `serverless` package is **the plan's server** for everything a frontend keys on: the
  `server` selection and `server:<flag>` facts, the `SERVER_*` placeholders, the contract a
  frontend consumes. A plan has at most one package of kind `server` or `serverless`.
- A plan whose API is `serverless` has no deploy mode and no `docker-compose.yml`. Provenance
  records no `deploy`.

### K2. What a `serverless` template keeps of the Server contract

Everything in `docs/conventions.md › Server` except the rows below.

| Server contract | In a `serverless` template |
| --- | --- |
| Two entry files (`index`, `server`) | The platform routes; a route file is `gates → validate → controller`. Tests send a request through the routing, never start a listener |
| `api/<module>/routes` | The module's route files; the gate chain is the first arguments of each handler, built from `middleware/` |
| One Docker image; `STATIC_DIR` | None. ▲ `start` serves the frontend's built output on the functions' own origin when the plan has a frontend that declares `static` (K5) |
| Jobs and the in-process bus | No bus. A scheduled job is a second function unit behind the `jobs` flag |
| Config from environment variables, read once | The same rule on the request's bindings: one env module validates them once per isolate; nothing reads `process.env` or keeps a module-level connection |
| The data engine as a catalog provider (`capabilities`) | The engine is the platform's and part of the base. The template declares `migrate`, `testDb` and `e2eDb` itself and has no `capabilities` |

Kept without change: the layer map and import direction with lint zones, `api/<module>/schema`
as the leaf, **OpenAPI 3.1 produced from the request schemas** (`contract`, the committed
document), singular `/api/<entity>` paths, JSON only, the one error envelope, a request id on
every response, the `by_ip` /64 rule, `GET /api/health` and `/api/health/ready`, one log line
per request with secrets redacted, the agents file's five server headings.

### K3. A frontend that ships no image

- ▲ A frontend manifest may say `docker: false`: the template has no `compose.yaml` and no
  Dockerfile, and it joins a plan only alone or beside a `serverless` package. A stack that
  puts it beside a `server` package is refused: both deploy modes need an image.
- `frontend/astro` 1.0.0 says so. Frontend invariant 9 (Shipping) then reads: `static: { out }`
  with HTML at that root; the host is a static host or the plan's `serverless` package.
- A later version may add the Dockerfile and nginx config and drop the key; nothing else moves.

### K4. Tools

- Schemas: the kind, the `serverless/` path, the two-segment directory, `docker`.
- Loader: a `serverless` template needs no `compose.yaml` and refuses one; its agents file
  carries the server's five headings; it may declare `contract: { produces }` and must not
  declare `static`, `capabilities` or `onlyWhen`.
- Plan and generator: K1's server role; no Compose file and no deploy mode without a `server`
  package; ▲ a `FRONTEND_PATH` placeholder for the API package (the relative path to the
  frontend's directory, empty facts when the plan has none), and `SERVER_DIR` values that work
  from a nested directory.
- Markers: `.jsonc` takes `//`; an `.astro` file takes `//` in its frontmatter and `<!-- -->`
  in its markup, in one pass. A path listed under two flags exists while both are on.
- Case runner: a `serverless` case runs `check` and `testDb`; a frontend case in a stack with a
  `serverless` package runs its e2e against that package's `start`. No service is started and
  Docker is never needed.
- A `cloudflare` gitignore section.

### T1. `serverless/cloudflare`

```
serverless/cloudflare/
├── functions/           file path = route
│   ├── _middleware.ts   request id · request log · error handler · response headers
│   └── api/             health · module/ (the reference module)
├── server/              never routed; imported by functions/ and workers/
│   ├── api/<module>/    controller · schema · service · model (the Drizzle table)
│   ├── config/          env.ts · constants.ts · openapi registry
│   ├── middleware/      handler · validate · rate-limit · error-handler
│   ├── models/<name>/   interface · type · enum · constants
│   ├── services/        logger · security/ · utils/
│   └── infra/           bindings.ts · db.ts
├── pages/               what the platform reads beside the built site: _routes.json,
│                        base _headers, _redirects
├── workers/jobs/        with the jobs flag
├── migrations/          SQL from drizzle-kit
├── scripts/             dev · start · assemble · e2e-db · openapi
├── tests/               api/ (workerd) · unit/
└── wrangler.jsonc · worker-configuration.d.ts · drizzle.config.ts · openapi.json ·
    tsconfig.json · eslint.config.mjs · package.json · .env.example · AGENTS.md
```

- **Request flow:** `functions/_middleware.ts → route file → gates → validate → controller →
  service → Drizzle → D1`. The root middleware gives every API response a request id, one log
  line, the envelope for a thrown error and the security headers (a `_headers` file never
  covers a Function's response). `server/` uses the web platform's `Request` and `Response`
  and imports no Pages type, so a move to Workers replaces `functions/` only.
- **Contract:** `server/api/<module>/schema.ts` holds the zod request and response schemas;
  `contract` writes `openapi.json` from them, in Bun, outside the runtime.
- **Config:** `server/config/env.ts` validates the bindings; it fails in production on a
  missing secret and defaults elsewhere with a warning. `wrangler.jsonc` sets `ENVIRONMENT`
  per environment, and `env.preview` names its own D1 database, so a preview build never
  touches production data. No secret is in the file. `.env.example` lists every variable; a
  local override goes in `.env`, which `wrangler pages dev` reads (S6). The template ships no
  `.dev.vars` and tells the reader not to create one: where it exists, `.env` is ignored whole.
- **Data:** D1 through Drizzle; `drizzle-kit generate` writes SQL into `migrations/`;
  `migrate` applies it locally. D1 has no interactive transaction: a rule that must not race
  is one conditional statement or one batch. Rate-limit counters are a table hit by one upsert.
- **No accounts in 1.0.0.** Every endpoint is public. The gate chain takes a product's own
  gate; the guide shows where (the reference site sits behind Cloudflare Access). Accounts are
  a later plan; it inherits `server/bun-express`'s auth surface and S3's measurements.
- **One origin (▲).** `assemble` copies the frontend's built output into `dist/`, adds
  `pages/`'s files, and lifts the Content-Security-Policy that Astro wrote into each page's
  `<meta>` into `dist/_headers`, with the directives a header can carry and a meta tag cannot
  (`frame-ancestors`, plus `default-src`, `base-uri`, `object-src`). `start` assembles, then
  runs `wrangler pages dev dist` on the e2e state folder. `_routes.json` sends only `/api/*`
  to the functions, so a static page invokes none. With no frontend in the plan `start` serves
  the functions alone.
- **Deployment** is one Pages project whose root directory is `serverless/cloudflare`; its
  build command builds the frontend and runs `assemble`. No agent and no script of the
  template deploys, logs in or reaches a remote binding. Not proven on a deployed project: no
  session holds an account.
- **Gates:** two vitest projects (unit in Node, the API in `workerd` through the platform's
  real routing with a migrated D1; storage is isolated per test file, so setup empties every
  table before each test). `check` runs the `wrangler types` freshness check, `tsc`, ESLint,
  Prettier, a contract-freshness check and both projects; `testDb` runs the API project alone.
  ▲ TypeScript is pinned to 6 while a tool of the stack refuses 7.
- **Flag `jobs`** (off): `workers/jobs/`, a second Worker with its own `wrangler.jsonc` and
  one scheduled handler that imports `server/` (the cleanup of expired rate-limit rows).

### T2. `frontend/astro`

```
frontend/
├── src/
│   ├── pages/           index (one h1 and one line) · 404
│   ├── layouts/         the base layout: head, skip link, one <main id="main">
│   ├── components/      ui/ (the kit) · islands/ (with the islands flag)
│   ├── services/        with a server: generated/ (the client), api.ts · validation.ts
│   ├── models/          copy tables and what the contract does not give
│   ├── styles/          setup/ · themes/ · basics/
│   └── nav.ts
├── public/              theme-init.js · favicon · a host's own files pass through
├── tests/               unit/ · e2e/ (Playwright)
└── astro.config.mjs · tsconfig.json · eslint.config.mjs · playwright.config.ts ·
    package.json · AGENTS.md
```

- Astro with `output: 'static'` and no adapter; ▲ `build.format: 'file'` (the directory format
  makes Pages answer `/page` with a 308). A content page ships no script but the theme file;
  behaviour is a `<script>` in the page, which Astro bundles. No UI framework in the base.
- The ten frontend invariants hold, with K3's reading of invariant 9 and nothing for
  invariant 7 to apply to (no accounts). With a server: the client generated from its
  `openapi.json` into `src/services/generated/`, the wrapper, the envelope's copy tables, the
  dev proxy. Alone: none of it, and no `contract` command (ADR 0011).
- ▲ **Content-Security-Policy with no `'unsafe-inline'`**: Astro's `security.csp` hashes every
  script and style of the build into a `<meta>` on each page (S4). That is the whole policy
  when the site is hosted alone; with `serverless/cloudflare` the header carries it (T1).
- E2E on `phone` and `desktop`: alone, against the template's own preview of the built site;
  in a stack, against the server's `e2eDb` and `start` chain, which serves the built site.
- **Flag `islands`** (off): `@astrojs/react` and the `src/components/islands/` convention. ▲
  It ships no island: the template has no example code (ADR 0010).
- The guide carries `Adding a content page` and `Migrating a site into Astro`.

### T3. The guides and the migration

Each trait of a hand-written Pages site has a place: stamped HTML becomes layouts and content
collections, and `robots.txt`, a sitemap and generated text files pass through `public/` or an
Astro endpoint (`frontend/astro`); `_redirects`, `_headers`, function routes outside `/api`,
`_lib` logic moved into `server/` with TypeScript adopted file by file, other bindings
(Workers AI, a service binding, `ASSETS`), an Access-gated admin, the baseline of a
hand-migrated database and a preview environment on its own database (`serverless/cloudflare`).

### H. The harness (plan 026)

- A role's write lane comes from the packages provenance records: `backend` writes every
  `server` and `serverless` package, `frontend` every `frontend` package, `qa` their `tests/`.
  The constants stay as the fallback.
- `verify` runs `testDb`, `migrate` and `e2eDb` without Docker when the project's API is a
  `serverless` package.
- A sub-agent's `wrangler` is an allowlist of local subcommands; the main session is asked
  before a command that reaches the platform; `.dev.vars` and wrangler's login file are secret.

## Spikes (2026-11-16, Windows 11, no account; run on the one-package layout)

| Spike | Verdict | Finding the templates carry |
| --- | --- | --- |
| S1 one origin | pass | `wrangler pages dev <dir>` serves pages, the 404, `_headers`, `_redirects` and functions on one port; `build.format: 'file'`; the dev proxy targets `127.0.0.1` |
| S2 tests in `workerd` | pass | `@cloudflare/vitest-plugin` (the renamed pool) on vitest 4.1; the functions are built once per run and tests call the built worker; isolation is per file |
| S3 password hash | partial | Not used in 1.0.0. scrypt N = 2^17 needs the whole isolate's memory; N = 2^14, p = 5 fits; production limits not testable here |
| S4 CSP | pass | hashed `script-src` and `style-src`, no `'unsafe-inline'`, an island hydrates; a post-build step moves it into `_headers` |
| S5 two type worlds | pass | Kept as the frontend's DOM project and the functions' runtime project, now one per package; TypeScript 6 |
| S6 env file | pass | `.env` alone reaches `context.env`; a `.dev.vars` hides it; `.env.<environment>` is not read |
| S7 e2e data | pass | `--persist-to` on `migrations apply`, `execute` and `pages dev` share one layout; dev and e2e state never meet |
| S8 baseline | pass | create `d1_migrations` if absent, insert the applied file names, then `migrations apply` runs only the new ones |

Versions the spikes ran: astro 7.4.12, wrangler 4.163.0, `@astrojs/react` 7.1.9, react 19.3.1,
vitest 4.1.12, `@cloudflare/vitest-plugin` 1.8.3, drizzle-orm 0.45.4, drizzle-kit 0.31.11, zod
4.6.7, eslint 10.15.0, `@playwright/test` 1.65.1.

## Alternatives considered

- **One package** holding both halves, under a `fullstack` kind. Built first, on the owner's
  ruling of 2026-11-16, then replaced by his ruling of 2026-11-17. It kept the tree he pasted
  and one install; it cost the harness its per-package lanes and its parallel implementer
  stage, tied the page framework to one provider, and put a second contract mechanism (a
  shared schema folder) beside OpenAPI.
- **The frontend importing the functions' zod schemas** across the two packages. Less
  machinery; it ties `frontend/astro` to one package and needs a cross-package import rule the
  catalog has nowhere else. Rejected by the owner for the contract.
- **A `server` template for the functions** (`server/cloudflare-functions`, directory
  `backend`). It would reuse every tool unchanged. Rejected: the owner wants the provider
  visible in the path, and a `server` is a process with an image and a deploy mode.
- **Workers with static assets.** Where the platform's new features land. The reference site
  is a Git-connected Pages project, so Pages Functions is the smaller move.
- **Server-rendered Astro on the Cloudflare adapter.** It makes every page a Function
  invocation and ties the server code to Astro's request types. Rejected: the pages are
  content, and static output has no runtime.
- **A Dockerfile and nginx config for `frontend/astro` now.** It would make the frontend
  usable beside `server` templates. Deferred (K3): nothing asks for it yet.

## Consequences

- An Astro site can be created alone, and the functions added later by the harness's scaffold,
  as any server is added to a lone frontend (ADR 0011).
- A second provider is a new template under `serverless/`; a second page framework beside
  these functions is a new stack. Neither changes a kind.
- The catalog has package directories of two segments, which every tool and the harness must
  handle.
- The harness keeps its per-package lanes and its parallel implementer stage on this stack.

## Out of scope

The reference site's migration. Accounts. KV, R2 and Queue helpers; product integrations.
Server-rendered Astro and view transitions. A move to Workers with static assets.
`frontend/astro` beside a `server` template (K3).
