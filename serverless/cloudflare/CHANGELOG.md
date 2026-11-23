# Changelog

## 2.1.1 — 2026-11-23

Tests only; the Worker is unchanged. Beside a single-page frontend two tests failed in a generated
project: no case had run the Worker's own gates with one.

- `tests/unit/start.test.ts`: a frontend with a `fallback` answers an unknown page with its shell
  (200, `no-cache`), not its 404 page; the 404 check covers the other frontends.
- `tests/api/frontends.test.ts`: `/%2e%2e/x` leaves the encoded-separator list, since `new URL`
  resolves a whole `%2e%2e` segment (`/x`, inside the host's folder); `/%2e%2e%2fx` takes its place.
- Case `two-templates`: the Worker's gates beside the Astro `site` and an Angular `admin`.

## 2.1.0 — 2026-11-23

A single-page frontend beside the Worker ([ADR 0017](../../docs/adr/0017-another-frontend-template-beside-a-worker.md) D3).
Nothing changes for a plan whose frontends declare no `fallback`.

- `server/middleware/frontend-host.ts` (several frontends): when the assets answer 404 to a GET or
  HEAD on a host whose frontend declares a `fallback` (read from the generated `__FRONTENDS__`
  list) and the path's last segment has no dot, the Worker answers that file from the frontend's
  folder with 200 and `cache-control: no-cache`. A path with a dot stays 404, other methods are as
  before, the encoded-separator and unknown-host refusals still come first, and the assets'
  redirect of the file to its folder is followed once inside the Worker.
- `tests/api/frontends.test.ts`: the deep link, the missing file, a POST, the other frontend's host
  and the encoded separator; they run only in a plan with a single-page frontend.
- Content-Security-Policy of such a frontend: `assemble` serves a page without a policy meta with the
  fixed header line alone under `/<dir>/*` and warns ("served without a script policy"). Angular's
  `index.html` carries one since `frontend/angular` 4.2.0 (`script-src 'self'; script-src-attr 'none'`
  beside this Worker), so the warning no longer shows for it.

## 2.0.0 — 2026-11-22

One Cloudflare Worker with static assets, routed by Hono, in place of Pages Functions
([ADR 0016](../../docs/adr/0016-one-worker-with-static-assets.md) W1, W2, W4, W5). A project on
1.0.0 follows `AGENTS.md › Moving from Pages Functions`.

Breaking:

- `wrangler.jsonc` has `main` and `assets` (`dist`, `ASSETS`, `404-page`, `run_worker_first:
  ["/api/*"]`); `pages_build_output_dir` is gone, and so are `functions/`, `pages/_routes.json`,
  `dist-functions/` and every `wrangler pages` command. `pages/` is `static/`.
- Routing is `server/api/<module>/routes.ts` (a Hono router: gates, validation, controller call)
  mounted by `server/server.ts`; the Worker's export is `server/index.ts`. `handle(...)` returns a
  Hono handler, `PlatformEvent` and `rootMiddleware(event)` are gone (`rootApp()` replaces them),
  and the root middleware wraps `/api/*` only: a static file never gets the API's headers.
- The `jobs` flag is a `scheduled` handler and a cron trigger in the same Worker; `workers/jobs/`
  and its `wrangler.jsonc` are gone.
- `dev` and `start` run `wrangler dev` (`start`'s `--var` replaces `--binding`); `assemble`'s `pages`
  option is `statics` and it writes no `_routes.json`.
- The `api` tests run the Worker's own entry in workerd, with no build step; `through` takes a
  `route`, `PlatformEvent` is gone, `mounted` mounts one router alone.
- New dependency: `hono` 4.13.20. `runtime.platform` is `cloudflare-workers`.

Added:

- Lint: Hono only in the entries, the `routes.ts` files and `middleware/handler.ts`; another
  module's `service` or `model` refused however it is spelled.
- Modules that can move out ([ADR 0016](../../docs/adr/0016-one-worker-with-static-assets.md) W4):
  rules for another module are async and take and return plain data, modules share no memory, and
  each router has a test mounted alone.
- `AGENTS.md`: "Moving from Pages Functions" and "Scaling out"; Deployment by Workers Builds or
  `wrangler deploy` (by a person), with the two limits of Workers that Pages did not have.
- Several frontends ([ADR 0015](../../docs/adr/0015-several-frontends-by-directory.md),
  [ADR 0016](../../docs/adr/0016-one-worker-with-static-assets.md) W3): with more than one frontend
  in the plan, `assemble` writes each build to `dist/<dir>/` (merging their `_headers` and
  `_redirects` into the root files with the folder in front of every path, one policy line per
  folder; `--only <dir>` assembles one, `--frontend <dir>=<output dir>` moves a build and fails on a
  value that is no pair or names no frontend), `run_worker_first` is `true`, and the Worker maps the
  request's host to a folder through `FRONTEND_HOSTS` (validated in `config/env.ts`, required in
  every environment, empty in `preview` and `production` until a deployer sets it): an unnamed host
  gets 404, a redirect's `Location` loses the folder, `/api/*` answers on every host. With one or no
  frontend nothing changes and the variable does not exist.
- The admin namespace (ADR 0015 A1), with every plan: `server/api/admin/routes.ts` mounted at
  `/api/admin` behind one gate (`middleware/admin-gate.ts`, which refuses every request with 403
  until the product writes its own) and, beside a frontend named `admin`, behind the host rule
  (404 on any other host). `api/admin/<module>/` is a module like any other in the lint.
- `wrangler types` runs with `--strict-vars=false`, so the generated types do not hold the values
  of the variables (the host map names the project's directories).

## 1.0.0 — 2026-11-17

First release: the Pages Functions API of [ADR 0014](../../docs/adr/0014-astro-cloudflare-pages.md),
the first template of the `serverless` kind.

- The request flow: `handle(...gates, controller)`, the typed `Context`, the root middleware (request
  id, error envelope, security headers, one JSON log line), `validate`, `rate-limit`.
- The reference `module` and `GET /api/health`, `GET /api/health/ready`.
- The contract: zod schemas and OpenAPI registrations in `server/api/<module>/schema.ts`,
  `openapi.json` written by `bun run openapi` (the `contract` command) and checked fresh by a unit
  test.
- D1 through Drizzle: migrations in `migrations/`, `migrate` and `e2eDb` (a separate state folder), a
  rate-limit table hit by one upsert per check.
- One origin: `pages/` (`_routes.json`, base `_headers`, `_redirects`), `assemble` (a frontend's build
  output plus `pages/`; each page keeps its own policy meta, checked to allow only `'self'` and hashes for
  scripts and styles, and one fixed Content-Security-Policy header line is added; a `_headers` that
  sets or detaches the policy and a symbolic link are refused; Pages' `_headers` limits are checked), `start` and `dev`, which end their whole process tree.
- Gates without Docker or an account: `wrangler types --check` (independent of a local env file),
  `tsc`, ESLint import zones proved by a boundary test, Prettier, and vitest in `workerd`.
- The `jobs` flag (off by default): `workers/jobs/` with a scheduled cleanup of expired rate-limit
  rows.
- No accounts (ADR 0014): no `auth` flag.
- `AGENTS.md`: the layer map, where each addition goes, the data-layer patterns for a database with
  no interactive transaction, the deployment steps a person takes, and the recipe that migrates an
  existing Pages site (a preview database first, the baseline of a hand-migrated database, `_lib`
  logic into `server/`, routes outside `/api`, other bindings, an Access-gated admin).
