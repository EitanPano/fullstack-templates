# ADR 0003: SPA frontends and the single and split deploy modes

Status: accepted (2026-10-24, gate G1 of plan 010)
Owner: Eitan
Plan: `fullstack-dev-harness/.plan/010-2026-10-24-frontend-react.md` (milestone 5)
Amends: ADR 0001 (D2, D4, D5, D7, Delivery order) and `docs/conventions.md`

## Context

ADR 0001 names `frontend/react` (Vite) as the template after `server/python-fastapi`. D4 already
allows its shape: a feature's data access is `server/` "for a server-rendered framework, `api/`
otherwise". Three things are still open, and this ADR closes them before any code is written.

- **Why an SPA.** Next.js is the only frontend today. A single-page app is the other common
  shape: static files, no frontend runtime, and a client that talks to the API from the browser. A
  catalog that offers only a server-rendered framework cannot serve a product that wants no Node
  process in production.
- **Why one container by default.** With Next, the frontend container is the public edge and the
  API sits behind it on the Compose network. A static SPA has no server of its own, so a second
  container exists only to serve files. A project that starts as one container has no CORS, no API
  URL in the bundle, one port and one deployable. It can move to two containers, or to a static
  host, when scale or hosting calls for it. The reverse (starting split and merging) is no easier,
  so the default is the simpler topology.
- **Why the shape is defined once.** Vue and Angular templates follow React. If each invents its own
  layout, an agent finds a different frontend every time. The contract in `docs/conventions.md` is
  written for the SPA kind; React is its first implementation.

What the code does today, checked against the catalog at `0b97243`:

- `tools/lib/plan.ts` has one reserved marker selection, `server` (`SERVER_SELECTION`), true when the
  plan has a server package. `selectionsFor` adds it to the flags. `dry-run.ts` varies it like a flag,
  deletes it from the switches and passes it as `hasServer`.
- `frontend/next`'s fragment publishes `__PORT__:__PORT__` on every interface. Both server fragments
  publish `127.0.0.1:__PORT__:__PORT__` and default `TRUST_PROXY` to 1, because the Next server counts
  as the one proxy hop.
- Neither server serves files. Their Dockerfiles copy only `src/` (and `node_modules` or the venv).
- `SERVER_AGENTS_HEADINGS` is the exact-match list `Adding a module`, `Adding the data layer`,
  `Errors`, `Tests`, checked for `kind: server` only. A frontend's agents file is not checked.
- Cases carry `withApp` (`schemas/cases.schema.json`); `.fullstack/catalog.yaml` has no deploy field.

Evidence for the choices below comes from the S1 spike of plan 010 (see S1 findings).

## Decisions

The numbers follow plan 010. Each decision lists the alternatives that were rejected.

### M5-1. The SPA frontend contract

Written in `docs/conventions.md › Frontend, single-page app`. Every SPA template satisfies it.

- **`src/app/` is routing only.**
  - `routes.tsx` is the route table.
  - The root has `layout.tsx` and `not-found.tsx`.
  - Each route segment has `page.tsx`, `loading.tsx` (the hydrate and pending fallback) and
    `error.tsx` (the route's error boundary).
  - `src/main.tsx` mounts the router and the toaster and nothing else.
- **`feature/<name>/` holds `ui/`, `api/` and `model.ts`.**
  - `api/` holds the route loaders and actions.
  - Only `feature/*/api/` imports `lib/api/client` (lint).
  - Import direction is `app → feature → shared, lib`.
- **The API is always reached at relative `/api/*`** on the page's own origin, in every deploy mode.
  In development the dev server proxies `/api` to the server's port. No API URL is compiled into
  the bundle, and there is no CORS.
- **`build` writes `dist/`**, with `index.html` at its root and hashed files under `dist/assets/`.
  The manifest declares `static: { out: dist }`.
- **`src/env.ts` is the only reader of `import.meta.env`** (lint). It holds browser-visible values
  only and never a secret.
- **E2E.** When `E2E_BASE_URL` is set, Playwright tests that URL and starts no web server;
  otherwise it starts the server's dev command and the dev server.
- **The Dockerfile has two targets:** `dist` (the built files only, at `/dist`) and the default
  `serve` (the split-mode static server).
- **The agents file** has a layer map and the headings `Adding a feature`, `Styling`, `Errors`,
  `Tests` and `Deployment` (M5-9).

Why: the shape mirrors `frontend/next` (routing-only `app/`, `loading`/`error` per segment, one
data layer per feature), so the same agent works in both. Relative `/api` is what makes `single`,
`split` and a dev proxy the same code. `E2E_BASE_URL` is what lets the e2e suite run against the
built container (M5-8).

The new manifest field `static` is frontend only. `static.out` names the directory the build writes;
the loader checks that it is present, and the app smoke (M5-8) proves that the `dist` target holds an
`index.html`.

### M5-2. The React template

- **Libraries.** React 19 (the version `next` pins, 19.3.0), React Router 8 (8.5.0) in data mode, Vite with
  `@vitejs/plugin-react`, Tailwind 4 through `@tailwindcss/vite`, sonner, lucide-react,
  openapi-fetch with openapi-typescript, zod, Vitest with Testing Library and jsdom, Playwright with
  `@axe-core/playwright`, Prettier.
- **Lint.** ESLint with typescript-eslint `strictTypeChecked`, react-hooks and jsx-a11y.
- **Versions** are current stable, verified against the registry, locked in `bun.lock` and listed
  under Versions below. They are never written from memory. Three deliberate exceptions to "latest"
  are recorded there: React stays at the version `next` pins, and ESLint and TypeScript stay one
  major behind.
- **React Router 8, not 7.** The plan was written when 7 was the version the team knew; 8.5.0 is the
  registry's `latest`, and the binding rule is current stable. S1 ran the same data-mode app on
  8.5.0: the file shape, the package (`react-router`, with `RouterProvider` from `react-router/dom`)
  and the `loader`, `action`, `ErrorBoundary` and `HydrateFallback` keys are unchanged, and every gate
  and the browser CSP run passed. Cost: fewer third-party examples for the newest major.
- **Manifest.** `http: { port: 5173, health: / }`; `defaultStack: react-python-fastapi`; the same
  command vocabulary as `next`, with `contract` running `bun run api:types`.
- **Styling.** Tokens are CSS variables in `src/app/globals.css`, exposed with `@theme inline`, as
  in `next`.

Rejected:

| Alternative | Why not |
| --- | --- |
| TanStack Query | A cache the template does not need. React Router 8 data mode gives per-route `loader`, `action`, `ErrorBoundary` and `HydrateFallback`, which mirror Next's loaders, server actions, `error.tsx` and `loading.tsx`, and add one library instead of two. A product adds a cache library by plan. |
| Port 3000 for the dev server | Vite's convention is 5173. A port other than 3000 also proves that the frontend port flows through the generator (`__PORT__`, the Compose fragment, provenance), which with two Next-shaped frontends would stay hidden. |

### M5-3. The client and the CSRF stance

`lib/api/client.ts` builds
`createClient<paths>({ baseUrl: window.location.origin, fetch: (r) => globalThis.fetch(r) })`.

- The origin is resolved explicitly because undici's `Request` refuses a bare path, which would break
  the client under Vitest.
- Requests carry the session cookies by fetch's same-origin default.

**CSRF.** The server's cookies are `httpOnly`, `SameSite=Lax` and `Secure` outside development
(`services/security/cookies`), and are unchanged. In `single` and in `split` the browser and the API
share one origin, so CORS stays off. A cross-site page then cannot send an authenticated mutation:

- `SameSite=Lax` withholds the cookie from cross-site `POST`, `PUT`, `PATCH` and `DELETE`;
- bodies are JSON only, and a cross-site form cannot send `application/json` without a preflight;
- there is no CORS configuration to answer that preflight.

No CSRF token is generated. The stance holds while all three conditions hold. Moving the frontend to
another origin breaks them (see the static-host mode below).

### M5-4. Deploy modes

- **Inputs.** `--deploy single|split` on the CLI, `deploy` in the answers JSON, and `deploy` in
  `.fullstack/catalog.yaml`.
- **Provenance.** `.fullstack/catalog.yaml` gains an optional top-level `deploy: single|split`. It is
  written whenever the plan has both a server and a frontend, and absent otherwise.
  `schemaVersion` stays 1.
- **`single`** (the default when the stack has a server and its frontend declares `static`):
  - the server's image holds the API and the SPA's `dist/`, and serves both on the server's port;
  - the frontend gets no runtime container: its fragment is assembled as a build-only service
    (`build.target: dist`, `scale: 0`, no ports, no profile), which the server's build reads as a
    context (M5-6);
  - every package's markers see the reserved selection `single` as true. It is never true in a plan
    without a server.
- **`split`** (the default otherwise): each package has its own image, as today. Next stacks are
  always `split`.
- **Refusals.** `--deploy single` with a frontend that lacks `static`, or with no server in the plan,
  fails and names the reason. An unknown value fails.
- **`__FRONTEND_DIR__`** resolves to the frontend's directory, for the server's fragment.
- **The mode is fixed at generation.** Changing it later is a project change through the harness's
  `deployment` skill. Provenance stays the generation record and is not edited.
  `.doc/architecture.md › Deployment` holds the current mode and wins when the two differ: provenance
  says what was generated, the doc says what runs now.
- **Ports.** The frontend's `http.port` is always its dev-server port, and in `split` also its
  container's port. In `single`, the deployed app and the app smoke use the server's port.
- **Markers.** `single` joins `server` as a reserved selection. A line marked `@single` is kept only
  in `single`; `@nosingle` only when it is off. Manifests cannot declare a flag named `single`, and
  `validate` dry-runs it on and off, restricted to combinations where `server` is true.

Rejected:

| Alternative | Why not |
| --- | --- |
| Gating static serving at generation | Moving between modes would be a regeneration, every case would multiply by two, and the server's source would differ per mode. Shipping it always and inert unless `STATIC_DIR` is set makes the move configuration (M5-5, OQ3). |
| Caddy as the split server | nginx-unprivileged is the industry default, non-root out of the box and templates its port from the environment, and S1 met every M5-7 row with it, so Caddy was not needed (M5-7). |
| A generated static-host (CDN) mode | A frontend on another origin needs CORS, cross-site cookies and a CSRF stance, which is a security decision per product (below). |
| `TRUST_PROXY` 1 as the default in `single` | See M5-6. |

### M5-5. Static serving in both servers

- **Configuration.** The env module reads `STATIC_DIR` once. Unset, nothing is mounted and the
  server behaves exactly as before. Set in production without an `index.html` in it, boot fails fast
  with a clear message.
- **Order.** It is mounted after the API routes and `/openapi.json` and before not-found, and never
  under `/api`.
- **Behaviour table**, identical in both servers:

  | Request | Response |
  | --- | --- |
  | GET or HEAD of an existing file | The file. `assets/*` gets `Cache-Control: public, max-age=31536000, immutable`; `index.html` gets `no-cache`. |
  | GET or HEAD of an extension-less path outside `/api` | `index.html`, `no-cache`. The SPA's router renders it, its own not-found included. |
  | A path with an extension and no file | The 404 envelope. |
  | `/api/*` with no route | The 404 envelope, unchanged. |
  | Another method on a non-API path | The 404 envelope, unchanged. |
  | A dotfile, an encoded traversal or a directory | The 404 envelope. Never a listing. |

  Every static response carries the security headers, CSP included.
- **Rulings from S1 on the table** (they bind S2):
  - A double-encoded name such as `/%252e%252e/x` decodes once to a literal, extension-less name
    with no file behind it, so it gets the shell (200). Nothing leaves the root, and an SPA route may
    contain `%`. The test pins "200 or 404, never the canary".
  - `/.well-known/*` is a 404 under the dotfile row. A product that needs it (assetlinks, security.txt)
    adds a route by plan; ACME challenges live at the edge.
  - `/assets/%2e%2e/index.html` is a 404 (the pre-check), although `express.static` alone would
    normalise it to `/index.html` and serve it.
  - An app builder takes an optional static directory that defaults to the env value (bun-express
    `createApp(staticDir?)`, python-fastapi likewise), so a test builds an app over a fixture
    directory. The env module still reads `STATIC_DIR` once.
  - A path that climbs out of the root through a symlink is a 404. The row runs on every OS, with no
    skip: through a directory link that needs no privilege (Node `symlinkSync(…, 'junction')`; Python
    `os.symlink` on POSIX and `_winapi.CreateJunction` on Windows).
  - Windows' case-insensitive file system is not a row (containers run Linux): on Linux `/INDEX.HTML`
    is a 404; on Windows the test asserts only that it is neither a listing nor an escape.
  - "Never under `/api`" is enforced by the handler's own case-insensitive skip of `/api` and
    `/api/*`, not by mount order.
  - Outside production a `STATIC_DIR` that does not exist does not crash boot: every page is the
    JSON 404.
- **Both servers implement the table identically, and each row maps to one test per server.** The
  mapping is the behaviour ledger (plan 010 › Execution protocol): one test name per row per server,
  audited by V06. A row with no test in either server is a defect.
- **Files.**
  - bun-express: `src/middleware/static.ts`, the mount in `src/server.ts`, the `STATIC_DIR` parse in
    `src/config/env.ts` and `.env.example`, and the ESLint zone.
  - python-fastapi: `src/app/middleware/static_files.py`, the mount in `src/app/server.py`,
    `config/env.py`, `.env.example` and the import-linter contracts.
- **CSP.** python-fastapi's `middleware/security_headers.py` already sends helmet's default CSP
  string (including `upgrade-insecure-requests`), so both servers send the same CSP on static
  responses. S1 proves that the built SPA loads under it over `http://localhost`.
- **No compression** in the server; the host's edge compresses (Left to the deployment).

### M5-6. The single image and its Compose service

Chosen by the S1 spike (OQ4): the Compose `service:` additional context, with the frontend's fragment
assembled in `single` as a build-only service.

- **The SPA build stays in the frontend's Dockerfile** (`dist` target: `FROM scratch`, the built files
  at `/dist`). The server's Dockerfile never builds a frontend itself.
- **The frontend's fragment in `single`** is assembled with `build: { context, target: dist }` and
  `scale: 0`, no ports and no profile. Compose builds its image (a few kilobytes) and creates no
  container. The `serve` target and the ports belong to `split`, which does not carry `scale: 0`.
- **The server's Dockerfile** gains `@single` lines that copy `/dist` from the `spa` context to
  `public/` beside the app (`/app/public` in both servers) and set `STATIC_DIR` to that path:

  ```dockerfile
  COPY --from=spa /dist ./public
  ENV STATIC_DIR=/app/public
  ```

- **The server's Compose fragment** gains `@single` and `@nosingle` lines:
  - `build.additional_contexts: { spa: "service:<frontend dir>" }` behind `@single`;
  - `TRUST_PROXY: ${TRUST_PROXY:-false}` in `single`, where `split` keeps `${TRUST_PROXY:-1}`;
  - in `single`, `ports: ["__PORT__:__PORT__"]`: the server is now the public edge, as the frontend
    container is in `split` today. With `TRUST_PROXY` false, no caller can choose its own client IP.
    In `split` the loopback-only `127.0.0.1` publishing stays;
  - each mode gets its own comments in place of the ones that say "the Next.js server counts" and
    that justify loopback by `TRUST_PROXY=1`.
- **Unchanged:** the derived `<dir>-migrate` service, which shares the image name and keeps working.

**Evidence** (S1-docker; Docker Desktop 29.7.2 with Compose v5.5.0 on Windows, and the Linux compose
CLI in `docker:<tag>-cli` containers against the same engine):

| Compose | Result of `service:` with `scale: 0` |
| --- | --- |
| 2.29.1 (`docker:26-cli`) | fails: `service:frontend` read as a local path |
| 2.33.0 (`docker:27-cli`) | fails: `spa` resolved as an image to pull (`docker.io/library/spa`) |
| 2.34.x | unverified |
| 2.35.0, 2.36.2, 2.37.3, 2.39.2, 2.39.4, 2.40.3 | works |
| 5.1.1, 5.1.4, 5.5.0 (Windows host), 5.6.1 | works |

- **Requirement: Compose 2.35.0 or later for `single`.** An older client fails with a message that does
  not name the cause, so the catalog's docs and the harness's next steps state the floor, the app
  smoke of a `single` case checks `docker compose version` first and fails naming the floor, and the
  CI workflow logs the runner's Compose version.
- **Behaviour observed.** `up --build --wait` builds both images, starts only the server, and `ps -a`
  lists no frontend container. `docker compose up -d` without a profile creates only the network.
  `build` alone builds the frontend. A frontend change is picked up by the next `up --build` (the
  server container is recreated); an unchanged frontend is fully cached. The Linux client and the
  Windows client behave identically; the engine was Docker Desktop's in both runs, so native Linux
  and GitHub's runner are for CI to prove.
- **A never-activated profile on the frontend** (`profiles: [build]`) was rejected: Compose reports
  `service "backend" declares unknown service "frontend" as additional contexts spa` on every version
  tested except 5.6.1. A profile that `--profile app` activates starts the service, and a `scratch`
  image has nothing to run.
- **Risk: `scale: 0` as build-only is observed behaviour, not documented.** The spike did not read a
  specification that promises it. A future Compose could warn or build differently; the CI smoke is
  the guard, and the fallback below is the way out.
- **Gotcha.** `docker compose down` without `--profile app` does not see the profiled server service
  and leaves it running; use `docker compose --profile app down` (or `COMPOSE_PROFILES=app`). The
  `deployment` skill and the next steps say so.

**The fallback: a local named context.** `build.additional_contexts: { spa: ./__FRONTEND_DIR__ }`
(relative to the Compose file, not to the build context), with a `@single` build stage in the server's
Dockerfile that installs and builds the SPA from that context, then `COPY --from=spa-build /src/dist
./public`. The frontend's fragment is not assembled in `single`. S1 proved it works, is independent of
the Compose version, and that the named context's own `.dockerignore` (the frontend's) applies while
the server context's does not. Its cost is a second place that knows how to build the frontend, with
the toolchain and lockfile read twice, and the frontend's `dist` target unused. It is the switch if
Eitan rejects the Compose 2.35 floor at G1; M5-4, T1, S2, V04 and the `deployment` skill would then
follow the fallback column, not this one.

Rejected: `TRUST_PROXY` 1 as the `single` default. With no proxy in front, 1 lets any caller pick its
rate-limit key through `X-Forwarded-For`. `false` is safe locally, and production sets the hop count
(Left to the deployment).

### M5-7. The split frontend image

Chosen by S1 (OQ5): `nginxinc/nginx-unprivileged:1.31.7-alpine`. Every row below was met, so Caddy
was not tried.

- **Non-root.** The image runs as uid 101 (`nginx`); the port is above 1024.
- **Templated port.** The image's entrypoint renders every `/etc/nginx/templates/*.template` to
  `/etc/nginx/conf.d/` with `envsubst` over all defined environment variables, as uid 101. The
  template reads `${PORT}` (default 5173) and `${API_URL}`. It works with `--read-only` plus tmpfs on
  `/tmp` and `/etc/nginx/conf.d`. Traps, all binding on the config: `NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`
  must be set for `${NGINX_LOCAL_RESOLVERS}` to exist; `envsubst` also rewrites `$name` inside
  comments when a variable of that name is defined, so no `$` in comments; an environment variable
  named like an nginx variable (`host`, `uri`) would corrupt the config.
- **Behaviour.**
  - Hashed assets (`/assets/*`) are `public, max-age=31536000, immutable`; `index.html` and every
    other file are `no-cache`. Cache-Control is added without `always`, so a 404 carries none (with
    `always`, a missing asset got a year-long immutable 404).
  - An extension-less path falls back to `index.html`, a trailing-slash directory included, `/assets`
    without the slash included (a client route). `/assets/` and a missing file with an extension are
    404, never a listing. Dotfiles are 404.
  - `/api/` is proxied to `__SERVER_DIR__:__SERVER_PORT__` (the template's `${API_URL}`) with
    `X-Forwarded-For` set by `$proxy_add_x_forwarded_for` (a client-supplied value is kept and the
    peer appended, so the server's `TRUST_PROXY` of 1 reads the last hop). The `proxy_pass` goes
    through a variable and the Docker resolver, so nginx starts while the server is down (`/api` is 502
    until it is up). The proxy lines carry `@server`, so a lone frontend has none. The server's own
    headers pass through untouched.
- **Headers.** Static responses carry the 12 headers of helmet 8.3.0 (values dumped from `helmet()`,
  not written from memory): `Content-Security-Policy`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `Origin-Agent-Cluster`, `Referrer-Policy`,
  `Strict-Transport-Security`, `X-Content-Type-Options`, `X-DNS-Prefetch-Control`,
  `X-Download-Options`, `X-Frame-Options`, `X-Permitted-Cross-Domain-Policies`, `X-XSS-Protection`.
  `server_tokens off` hides the nginx version. They live in one snippet included by each static
  location, with no `add_header` at server level: a location with any `add_header` of its own drops
  those above it, so the proxied `/api/` location has none and carries exactly the server's headers.
- **nginx's own 400 is kept (ruling).** A path that climbs above the root is rejected by nginx's parser
  with 400 before any rule runs; a `400 → 404` mapping was dropped, because it would hide every real
  bad request. The property that binds is "never a listing, never a file outside the root", and tests
  assert 400 or 404 there. Encoded dot-dot and backslash forms that the parser lets through are refused
  with 404 by a rule on `$request_uri`.
- **Healthcheck.** `wget -q --spider http://127.0.0.1:${PORT}/` (the image has `wget` and `curl`; use
  `127.0.0.1`, because the listener is IPv4 only). The container reaches `healthy`.
- The backend keeps `TRUST_PROXY` 1 here, because nginx counts as the hop.

The verbatim `default.conf.template` and header snippet are in the S1-docker report of plan 010 and
are the starting point for R2; this ADR fixes the behaviour, not the file.

Why nginx-unprivileged: the industry default, non-root out of the box, and it templates its port from
the environment. Open risks recorded by S1: `X-Forwarded-For` behind a further proxy names the proxy,
not the end client; the image was exercised against Docker Desktop's engine only.

### M5-8. Proof per mode

`test-generated --with-app` runs these for a case that sets `withApp`.

- **`single`:**
  - health and ready on the server's port;
  - `/` and a deep link return `index.html`;
  - `/api/nope` returns the JSON 404;
  - the image's `public/` holds only built files (no `src/`, `.env*` or `*.map`);
  - then the frontend's `testE2e` with `E2E_BASE_URL` pointed at the container.
- **`split`:** the same through the frontend's port, plus `/api/health` through the proxy, and the
  frontend container running as a non-root user.

CI builds the images and runs the smoke and the e2e suite (with the axe scan) against the running
container in every mode. A `deploy` field on cases selects the mode.

### M5-9. The `deployment` skill and `AGENTS.md › Deployment`

- **Headings check.** `validate` extends the agents-file check to frontend templates and to
  `Deployment`:
  - frontend: `Adding a feature`, `Styling`, `Errors`, `Tests`, `Deployment`;
  - server: `Adding a module`, `Adding the data layer`, `Errors`, `Tests`, and `Deployment`.

  Both lists match heading text exactly, as `SERVER_AGENTS_HEADINGS` does, and ignore headings inside
  fenced blocks. The layer map is required by the contract but is not a checked heading, today or
  after this milestone: `server/*/base/AGENTS.md` has a `Layer map` heading that the check never reads,
  and `frontend/next` opens with its layer map as unheaded text.
- **`AGENTS.md › Deployment`** in each template states its own files and lines for each mode: the
  Dockerfile targets, the fragment lines that carry `@single`, the variables and the ports.
- **The harness's `deployment` skill** (not in this repository) covers choosing a mode;
  single → split and split → single as file-level steps that cite each package's
  `AGENTS.md › Deployment`, the root `docker-compose.yml` and `TRUST_PROXY`; a static host (CDN) as a
  documented security change; and what scaling needs: state out of process (the database, the cache
  task) and jobs on exactly one replica.
- **Where the mode lives.** The current mode is recorded in `.doc/architecture.md › Operational
  Concerns › Deployment`, with a change-log line when it moves.

### M5-10. Versions

- Catalog `v1.2.0`: additive, so `schemaVersion` stays 1 and the harness's
  `SUPPORTED_SCHEMA_VERSION = 1` holds.
- `frontend/react` 1.0.0.
- `server/bun-express` 2.3.0 (from 2.2.0).
- `server/python-fastapi` 1.1.0 (from 1.0.0).
- `frontend/next` 1.1.1 (from 1.1.0): `AGENTS.md › Deployment`, and a fix to its ESLint zones. S1
  found (F2) that the third `no-restricted-imports` block of its `eslint.config.mjs`
  (`files: ['src/**']`) replaces the zone rules for every file it matches, because ESLint flat config
  does not merge options of the same rule across blocks. On a generated project 7 of 11 seeded
  violations were missed: a cross-feature `ui/` import (alias and relative), `ui/` and `model.ts`
  importing `app/`, `shared/` and `lib/` importing `feature/`, and `lib/` importing `app/`. The
  boundary claims in `next`'s `AGENTS.md` are false until it is fixed; the fix is a patch-level bug
  fix, proved by one seeded probe per zone.
- `server/bun-express` 2.3.0 also fixes its ESLint zones if the audit (seeded probes, the same
  method) finds the same trap. The audit is a task of its own.

### The v1.1.0 to v1.2.0 difference for Next stacks (V04)

A Next stack generated from v1.2.0 differs from one generated from v1.1.0 only by:

- the inert static-serving code and its tests in the server package;
- `STATIC_DIR` in the env module and `.env.example`;
- the `Deployment` sections of the agents files;
- the provenance version fields and `deploy`;
- comments in the Compose file.

Services, ports and environment values stay identical. A diff that shows more is a defect.

## Left to the deployment

The templates do not generate these. The `deployment` skill and each `AGENTS.md › Deployment` name
them.

- **Compression.** The server serves bytes as they are. The host's edge (a CDN, a load balancer, nginx
  in `split`) compresses.
- **TLS termination.** The containers speak HTTP. `Secure` cookies and the CSP's
  `upgrade-insecure-requests` assume HTTPS in production, so an edge terminates TLS.
- **TLS for any non-loopback host.** Both servers and the split image keep helmet's default CSP,
  `upgrade-insecure-requests` included: the secure default, and a PaaS edge terminates TLS anyway.
  Chromium exempts `localhost` and `127.0.0.1`, so every proof runs on loopback and hides the cost: a
  deployment reached over plain HTTP at any other host name (a LAN IP, a Docker host name, an
  HTTP-only intranet proxy) shows a blank page, because the browser upgrades the script, stylesheet
  and `/api` requests to HTTPS and nothing listens there (S1 reproduced it at a non-loopback IPv4
  address). It needs TLS in front, or a deliberate product change to the CSP.
- **A CDN in front.** Hashed assets are immutable, so a CDN can cache `assets/*` for a year; `index.html`
  is `no-cache`.
- **Host-specific files.** Fly, Render, Railway, Cloud Run and Kubernetes manifests are out of scope.
- **The production `TRUST_PROXY` hop count.** The `single` fragment defaults to `false`, which is
  right with nothing in front. Behind a PaaS edge it is usually 1; behind a CDN and a load balancer it
  is 2. A wrong count either lets callers pick their rate-limit key (too high) or keys every caller
  to the proxy (too low). The Deployment line requires the product to set it.

## The static-host (CDN) mode

Not generated, because it changes the security model per product. A frontend served from another
origin (a static host) than the API requires, at least:

- `CORS_ORIGINS` set to the frontend's origin, so the server answers its preflights, with credentials;
- session cookies sent cross-site: `SameSite=None; Secure`, and a cookie `domain` that both origins
  share where the browser rules allow it;
- a CSRF defence, because `SameSite=Lax` no longer protects: a synchroniser token, or the
  double-submit cookie pattern with a custom header the server requires;
- an API base URL in the bundle, so the "no API URL compiled in" rule of M5-1 is given up
  deliberately, through `src/env.ts`.

The `deployment` skill documents the change as a planned project change with these steps. Nothing in
the catalog generates it, and `deploy` stays `single | split`.

## S1 findings

The S1 spike of plan 010 (2026-10-24) ran three scratch projects, none of which touched a tracked
file. The facts that bind later tasks:

**Image assembly (S1-docker).** The `service:` context works from Compose 2.35.0 with the frontend as a
`scale: 0` service; the evidence table and the fallback are under M5-6. The split image meets every
row of M5-7. Windows and Linux clients behave the same. The Linux runs used the Linux compose CLI in
containers against Docker Desktop's engine, so they prove client-side path and context handling, not a
native Linux engine; CI proves the rest.

**Static serving (S1-static).** Every M5-5 row is met in both servers, with 18 traversal probes, on
Windows and on Linux (Debian and Alpine for bun, `python:3.14-slim` for Python).

- **bun-express.** `express.static` (serve-static 2.2.1, send 1.2.1) with `index: false`,
  `redirect: false`, `dotfiles: 'ignore'`, `fallthrough: true` and `setHeaders`, plus three additions
  of about 90 lines in `middleware/static.ts`:
  - the shell fallback for an extension-less path, rejecting a directory;
  - a pre-check that rejects, on the once-decoded path, a `..` segment, a dotfile segment, a backslash,
    a NUL and a bad escape (send normalises `/assets/%2e%2e/index.html` to `/index.html` and serves
    it);
  - a `realpath` containment check, because send follows symlinks out of the root and offers no
    option against it (a symlink to a file outside was served on Linux before the guard).
  `setHeaders` runs before send sets its own `Cache-Control`, so a header set there wins.
  `path.extname('/.env')` is empty, so a dotfile looks extension-less; the fallback rejects dotfile
  segments itself. Express routes are case-insensitive and `req.path` keeps its encoding, so the `/api`
  skip lowercases and decoding is done once with a `try`. Mount: `app.use(staticFiles(dir))` after
  `registerRoutes` and `/openapi.json`, before `notFound`. `createApp(staticDir?)` is exported from
  `server.ts` because bun's test runner shares one process and `env` is read once.
- **python-fastapi.** A `StaticFiles` subclass in `middleware/static_files.py` (about 100 lines),
  mounted inside the app's router (`app.mount("/", SpaFiles(dir))`) after `register_routes` and
  `/openapi.json`. Starlette's `lookup_path` already resolves the real path and refuses a symlink out,
  so no extra guard is needed. Plain `StaticFiles` lacks the table (no shell, no cache headers, it
  serves dotfiles, `html=True` falls back to `404.html`), hence the subclass. Misses are
  `HTTPException(404)` inside the router, which the template's handler maps to the not_found
  envelope; a bare `StaticFiles` mounted outside the app would answer plain text. ASGI decodes the
  path before the app, so the subclass checks `scope["raw_path"]` for a stray `%` or a non-UTF-8
  escape (`/%`, `/%ff`), where Express refuses them itself. `HeadMiddleware` runs HEAD as GET, so
  static responses are covered. The `/api` skip is case-insensitive, to match bun (FastAPI routes are
  case-sensitive). No new import-linter contract: 34 kept, 0 broken. ruff on the 3.14 target writes
  `except OSError, ValueError:` (PEP 758); mind it when copying snippets.
- **Env.** `STATIC_DIR` is blank-as-unset and resolved to an absolute path. In production without an
  `index.html` it fails with `invalid environment: STATIC_DIR: <dir> has no index.html`, from
  `loadEnv` and `load_env`.
- **Results with `STATIC_DIR` unset.** bun-express `check`: all pre-existing tests pass unchanged
  (395 pass on Windows with two Linux-only symlink skips that the ruling in M5-5 removes; 397 on Linux).
  python-fastapi `check`: 872 passed on Windows (two symlink skips), 874 on Linux.

**React toolchain (S1-react).** The set in Versions resolved and locked: `bun install` writes
`bun.lock` (394 packages, no peer warnings), `--frozen-lockfile` passes in a clean copy, and a fresh
install from `package.json` alone gives a byte-identical lockfile. `tsc -b`, `eslint .`,
`prettier --check`, `vitest run` (7 tests) and `playwright test` (4) are green on the final tree.

- **Client under Vitest and jsdom.** `baseUrl: window.location.origin` works. jsdom's origin is
  `http://localhost:3000` (Vitest's default). The stubbed `fetch` receives a `Request` whose URL is
  `<origin>/api/health`; an absolute base avoids undici's refusal of a bare path. `client.ts` calls
  `globalThis.fetch(request)` at call time, so `vi.stubGlobal('fetch', …)` after import takes effect.
  A jsdom `AbortController` signal works. A relative `baseUrl` was not tested.
- **ESLint `no-restricted-imports` trap.** ESLint flat config does not merge the options of one rule
  across blocks: the last matching block wins. A broad `src/**` block therefore silently replaces the
  zone blocks before it (the bug in `next`, M5-10). The React config avoids it with disjoint zones,
  each listing every pattern that applies to its files (constants `upward`, `featureOnly`,
  `clientPaths`), one `no-restricted-imports` per file. A lint test seeds one violation per zone
  (V08). Relative patterns have a depth limit: `'../../*/ui/*'` matches only a file directly in
  `ui/`; the alias pattern `@/feature/*/ui/*` also forbids a feature importing its own `ui/` through
  the alias, so inside a feature imports are relative. `import.meta.env` is banned by
  `no-restricted-syntax` on the `MetaProperty` selector, off for `src/env.ts` and the config files.
- **Build.** `dist/index.html` has no inline script or style and no modulepreload polyfill; assets are
  hashed; there are no source maps by default. The dev-mode page has an inline React-refresh script,
  which is not in the build. Sonner injects a `<style>` at runtime, allowed by helmet's
  `style-src … 'unsafe-inline'`; a stricter `style-src` would need a nonce (untested).
- **CSP in Chromium (Playwright 1.64.1).** helmet 8.3.0's default CSP, `upgrade-insecure-requests`
  included, lets the production build load and call `/api/health` on `http://localhost` and
  `http://127.0.0.1`, on `/` and a deep link: no violation, no console message, axe clean. **Limit:**
  over plain HTTP at a non-loopback host the browser upgrades subresources to HTTPS and the page is
  blank; Chromium exempts only loopback. The decision is under "Left to the deployment". Express 5
  note: the SPA fallback route is `'/{*splat}'`, and `res.sendFile` needs `{ root }` when the path has
  a dot-directory.
- **Dev proxy.** Vite on 5173 (`strictPort`) proxies `/api` with `changeOrigin: false`, preserving
  `Host`; the dev server answers a deep link.
- **`prettier --check`** fails on `dist/` without an ignore entry, so `.prettierignore` lists `dist/`.

**The Linux-client method and its limit.** The Linux runs used
`docker run --rm -v //var/run/docker.sock:/var/run/docker.sock -v <dir>:/work docker:<tag>-cli docker compose …`
(`MSYS_NO_PATHCONV=1` in Git Bash). The engine is Docker Desktop's in both runs, so differences seen
are Compose-version differences, not operating-system differences. A native Linux engine and GitHub
Actions are for CI (V14) to prove, and V13 proves Windows.

## Versions

Registry-verified on 2026-10-24 with `npm view`, pinned exact in the spike, locked in `bun.lock`.
These are the values R1 starts from; R1 re-verifies them against the registry on its day.

| Package | Version | Note |
| --- | --- | --- |
| react, react-dom | 19.3.0 | the version `next` pins; 19.3.1 exists. One React across frontends |
| react-router | 8.5.0 | registry `latest`; peers react >=19.2.7, node >=22.22.0 |
| vite | 8.3.5 | |
| @vitejs/plugin-react | 6.1.2 | peer vite ^8 |
| tailwindcss, @tailwindcss/vite | 4.3.3 | |
| sonner | 2.0.8 | |
| lucide-react | 1.61.0 | |
| openapi-fetch, openapi-typescript | 0.17.0, 7.13.0 | |
| zod | 4.6.7 | |
| vitest | 5.0.5 | |
| jsdom | 30.1.3 | |
| @testing-library/react, dom, jest-dom, user-event | 16.3.3, 10.4.2, 7.0.1, 14.6.8 | |
| @playwright/test, @axe-core/playwright | 1.64.1, 4.14.0 | |
| prettier | 3.9.10 | |
| eslint, @eslint/js | 9.39.5 | registry latest is 10.13.0; see below |
| typescript | 5.9.3 | registry latest is 7.0.2; see below |
| typescript-eslint | 8.72.0 | peers `typescript >=4.8.4 <6.1.0` |
| eslint-plugin-react-hooks | 7.1.1 | flat preset `configs.flat['recommended-latest']` |
| eslint-plugin-jsx-a11y | 6.10.2 | flat preset `flatConfigs.recommended` |
| @types/react, @types/react-dom | 19.3.0 | |
| @types/node | 24.19.2 | matches the engine and `next` |
| express, helmet (CSP stub, as in `server/bun-express`) | 5.3.0, 8.3.0 | |
| nginxinc/nginx-unprivileged | 1.31.7-alpine | the split image's base (M5-7) |
| Docker Compose | >= 2.35.0 | the floor for `single` (M5-6); 5.5.0 and 5.6.1 verified |
| Bun, Node | 1.4.0, 24.15.0 | `engines`: bun >=1.4.0, node >=24.0.0 |

Rulings on the versions that are not "latest":

- **ESLint 9 and TypeScript 5.9, although ESLint 10 and TypeScript 7 are current.**
  `eslint-plugin-jsx-a11y@6.10.2` peers `eslint ^3 … ^9` only, and typescript-eslint 8.72.0 requires
  `typescript <6.1.0`. This matches `next`. Cost: a later major bump.
- **React 19.3.0, although 19.3.1 exists.** The version `next` pins (M5-2): one React across
  frontends. Cost: a patch bump later.
- **React Router 8.5.0, not 7.18.4** (M5-2).

Unverified by the spike: bun `trustedDependencies` need (no postinstall prompt appeared), and
React Router 8's browser targets.

## Amendments to ADR 0001 and conventions

- **D2:** a frontend template manifest gains `static: { out: <dir> }` (M5-1). A template's cases gain
  `deploy` (M5-8).
- **D4:** the frontend contract has two documented shapes, server-rendered and single-page app
  (M5-1). `conventions.md` gains "Frontend, single-page app" and "Deploy modes".
- **D5:** Compose assembly is per deploy mode (M5-4, M5-6); `__FRONTEND_DIR__` joins the package
  placeholders.
- **D6:** `generate.ts` gains `--deploy`; the headings check covers frontends and `Deployment`
  (M5-9); `test-generated --with-app` runs per mode (M5-8).
- **D7:** provenance gains an optional top-level `deploy` (M5-4).
- **Delivery order (After v1):** `frontend/react` ships with the `react-python-fastapi` and
  `react-bun-express` stacks in v1.2.0 (milestone 5).

## Consequences

- A product with an SPA starts as one container, one port and no CORS, and the topology is a
  configuration choice that the `deployment` skill moves.
- Both servers carry static-serving code that Next stacks never use. It is inert without `STATIC_DIR`
  and costs a mount, a table of tests and a few lines in the env module.
- The M5-5 table is a second behaviour contract between the two servers, kept equal by one test per
  row in each.
- Windows is on the critical path for `single` (V13), not only CI.
- `single` needs Compose 2.35.0 or later, and relies on `scale: 0` as a build-only service, which S1
  observed but no specification text promises. Ubuntu's archive compose plugin is older than 2.35.
  The local-context fallback (M5-6) is the switch if Eitan rejects that floor.
- Fixing the ESLint zones of `next` (and possibly `bun-express`) makes the boundary rules true, and
  may flag imports that the broken zones let through. That is code to fix, not a regression.
- Vue and Angular templates inherit the SPA contract and the `static` field. They need no new
  machinery, only their own base, Dockerfile targets and cases.
- A static host is a documented procedure, not a mode. A product that wants it accepts a CORS, cookie
  and CSRF change by plan.
- Provenance's `deploy` can go stale after a switch. `.doc/architecture.md` wins, and the skill
  updates it.

## Status of this ADR

Accepted by Eitan at gate G1 of plan 010 (2026-10-24), with the `service:` context and its Compose
2.35.0 floor (M5-6) and the ESLint zone fixes (M5-10). T1 and later build against it.

## As built (v1.2.0)

The decisions above held. These are the ways the shipped catalog differs from the accepted text,
each with its commit. The commits below are on the milestone branch.

Proof: <!-- P1 results -->

Differences from the text above:

- **React Router 8.5.0**, not 7 (the G1 delta, already written into M5-2): `frontend/react` pins
  `react-router` `8.5.0` exactly (`cc66002`).
- **python-fastapi needed its own symlink-out guard.** S1 said Starlette's `lookup_path` made one
  unnecessary. In S2 a name that exists in the tree but resolves outside the root (an
  extension-less link out of it) was skipped as missing and so served the shell, so the template
  carries an explicit guard (`_is_link_out`) and a test for it (`87d2320`).
- **`SpaMount`.** The static mount in python-fastapi is a `Mount` subclass whose `matches` returns
  `Match.NONE` for `/api` and `/api/*`, instead of a plain `mount("/")`. In this template the router maps
  404 and 405 to the same envelope, so the plain mount changed nothing observable; the subclass keeps
  the API's answers from becoming static misses by construction. Both servers have a test that
  every API answer is the same with `STATIC_DIR` set as without it, and python-fastapi a unit test
  that `SpaMount` never matches an API path (`87d2320`).
- **The encoded `/api` skip runs on the once-decoded path in bun-express**, as in python-fastapi, so
  `/%61pi/x` and `/api%2F…` get the API's 404 envelope and never the shell (`87d2320`). One difference
  between the servers remains and is pinned by a test in each: `/%61pi/health` is the 404 envelope in
  bun-express (Express routes on the raw path) and 200 in python-fastapi (Starlette routes on the
  decoded path). It is framework routing, not the static layer, and neither serves the shell.
- **nginx traversal refusal** is a `map` on the request path before the `?`, so a query string cannot
  trigger it, and `/api/` is exempt, so a proxied call whose query holds `..` or `%5c` reaches the
  server. The M5-7 text names `$request_uri` (`18d4934`).
- **nginx's own 400 is kept**, as ruled in M5-7. The tests assert 400 or 404 for a path above the root.
- **A lone frontend's `environment:`** sits under an `@server` marker in `compose.yaml`. Compose rejected
  the empty key a frontend generated alone would otherwise carry (`18d4934`).
- **`.conf` joined the marker engine and the text extensions** (`tools/lib/markers.ts`,
  `tools/lib/placeholders.ts`), with `#` as its comment syntax. A marker in a file whose extension
  neither list knows is not processed: `# @server` stayed in the generated nginx file until `.conf` was
  listed (`18d4934`). `validate`'s dry-run skips such files too, so it does not catch an unlisted type;
  that check was not added.
- **The react and Postgres case** is `stack-react-postgres` in `server/python-fastapi/tests/cases.yaml`,
  `deploy: single`, `withApp: true`. A frontend case cannot declare a capability, and the Next
  Postgres stacks live with the server for the same reason (`18d4934`).
- **The `single` smoke checks the Compose version first** and fails naming 2.35.0 when the client is
  older or prints no version; CI logs `docker compose version` (`768cb27`).
- **E2E runs twice for a static case that sets `withApp`**: once in the dev flow (the dev server and
  the server's dev command) and once against the container through `E2E_BASE_URL`. M5-8 names only
  the container run. The redundancy is known and left for a follow-up (`768cb27`).
- **The ESLint zones of `next`** were fixed in 1.1.1 as ruled at G1 (`f4ec3ed`): five disjoint zones and
  `tests/unit/eslint-zones.test.ts`. The bun-express audit seeded 132 imports and found 0 mismatches,
  so bun-express's zones are unchanged in 2.3.0. The audit's seed script is not in the repository.
  Relative cross-feature `ui/` patterns cover 2 to 4 levels of `../`; `next`'s `AGENTS.md` tells agents
  to use `@/` for imports across directories (`f4ec3ed`).
- **The frontend headings check has no layer-map heading.** It checks exactly `Adding a feature`,
  `Styling`, `Errors`, `Tests` and `Deployment`, as M5-9 says, and `next`'s and `react`'s layer maps remain
  unheaded text (`985447c`).

Not done:

- A check that flags marker text in a file the engine skips (see `.conf` above).
- A static-host mode, as decided.
