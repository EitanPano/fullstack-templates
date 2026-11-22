# ADR 0016: One Worker with static assets in place of Pages Functions

Status: accepted under the owner's word of 2026-11-22 ("complete your work", after the draft was
put to him; gate G2 of harness plan 030). The rulings in Context are his. The rows marked ▲ are
the session's, made from those rulings and the spike, and stand for his review at the `dev` →
`main` merge.
Built by harness plan 030 on `feat/frontend-type`. Catalog release `v1.15.0`:
`serverless/cloudflare` 2.0.0. Replaces the first ruling of
[ADR 0014](0014-astro-cloudflare-pages.md) ("Pages Functions, not Workers with static assets")
and its T1; K1 to K4 stand, with K2's routes row returning to the Server contract. Builds on
[ADR 0015](0015-several-frontends-by-directory.md).

## Context

- Cloudflare's documentation, read on 2026-11-22: the Pages page opens with "Start new projects
  with Workers". Pages is not marked deprecated and has no end date.
- ADR 0014 chose Pages Functions because the reference site was a Pages project, and kept
  `server/` free of Pages types "so a move to Workers replaces `functions/` only".
- The owner's rulings of 2026-11-22:

  | Ruling |
  | --- |
  | "If Cloudflare tells developers to start using Workers instead of Pages then update it as well" |
  | The router is a `routes.ts` in each module on Hono; `functions/` goes |
  | "The first deployments should include all inside 1 worker" |
  | "Only after some traffic has been monitored and the business decision is to scale, then the project will be required to scale and migrate to module per worker" |
  | "API should be modular for these scaling updates" |

## Decisions

### W1. One Worker

- The package is one Worker: `wrangler.jsonc` names `main` and `assets` (the directory, the
  `ASSETS` binding, `not_found_handling: "404-page"`, `run_worker_first`). The Pages keys,
  `functions/`, `pages/_routes.json` and every `wrangler pages` command go.
- The entry file only mounts: the root middleware (request id, request log, error handler,
  response headers), then each module's router at `/api/<name>`, then the admin namespace with
  its gate (ADR 0015 A1).
- `server/api/<module>/routes.ts` is `gates → validate → controller`, on Hono 4. ▲ Hono is
  imported by the entry, the route files and the middleware that adapts to it; a controller, a
  service and a model never import it. The lint holds that.
- ▲ **The `jobs` flag** adds a `scheduled` handler and a cron trigger to the same Worker.
  `workers/jobs/` and its second configuration go.
- Tests run in `workerd` against the Worker's own entry; nothing is built first.
- ▲ `wrangler types` and its `--check` in `typecheck` run with `--strict-vars=false`: the
  generated types hold a variable as `string`, not as one stage's value.

### W2. One frontend

The build sits at the root of the asset directory and `run_worker_first` is `["/api/*"]`: a
page never runs the Worker, as on Pages. `_headers`, `_redirects` and the 404 page are the
platform's. The Worker's own fallback for a path outside `/api` hands the request to `ASSETS`.

### W3. Several frontends (▲, from the spike)

- A Worker has one asset directory. `assemble` puts each frontend's build in a folder named for
  its directory (`assemble --only <dir>` builds one alone, for that frontend's own e2e), and
  `run_worker_first` is `true`: the Worker maps the request's host to that folder and fetches the
  file through `ASSETS`. Every request then runs the Worker and counts as one.
- **The host map** is one variable, `FRONTEND_HOSTS`, validated in the env module: each frontend
  at least once. The generator writes the local map (`<dir>.localhost`) into the development
  variables; `preview` and `production` hold it empty, so the Worker refuses every request until a
  deployer sets it.
- A host the map does not name gets 404 for pages, and so does a page path with an encoded slash,
  backslash or dot, refused before the assets are asked. One host cannot reach another frontend's
  folder.
- `/api/*` answers on every host, so each frontend calls its own origin. `/api/admin/*` answers
  on the `admin` frontend's host alone, 404 elsewhere: an edge login in front of that host then
  covers every admin route.
- **What `assemble` does for the platform's files:** a frontend's `_headers` and `_redirects`
  are merged into the root files with the folder in front of each path, and never copied into
  the folder, where they would be served as text. The policy line of ADR 0014 is written per
  folder.
- **What the Worker does:** it removes the folder from a redirect's `Location`.

### W4. Modules that can move out

A module can become a Worker of its own without a rewrite when these hold, and they do from
2.0.0:

- a module imports another only through its controller;
- a controller another module calls is async, and takes and returns plain data, so a service
  binding can stand in for the import;
- modules share no state in memory;
- each module's router answers its endpoints when mounted alone (a test does it).

Moving one is a project's task, after it has measured its traffic. The guide's "Scaling out"
carries the recipe: the module's entry and route, a service binding for the controllers it
calls, and a Worker per frontend as the first step when static requests are the cost.

### W5. Configuration and deployment

- `wrangler.jsonc` keeps an environment per stage, each with its own D1 database and variables.
  No secret is in the file.
- Deployment is Workers Builds or `wrangler deploy`, by a person. No agent and no script of the
  template deploys, logs in or reaches a remote binding. Not proven on a deployed Worker: no
  session holds an account.
- The guide states the two things Pages did that Workers do not: a custom domain must sit in a
  Cloudflare zone, and a preview address is one host, so it shows one frontend.
- A project on 1.0.0 follows the guide's "Moving from Pages Functions". It moves before it adds
  a second frontend.

## Spike (2026-11-22, Windows 11, no account, wrangler 4.163.0, hono 4.13.20)

One Worker, two folders, `wrangler dev`:

| Checked | Result |
| --- | --- |
| The host reaches the Worker | pass: `request.url` carries `site.localhost` |
| `_headers` on a file fetched through `ASSETS` | pass: path rules match the folder path; they also apply to the 404 page and to redirects |
| `_redirects` through `ASSETS` | pass, with the folder in `Location`; the Worker removes it |
| `.html` and trailing-slash redirects | the same: the folder is in `Location` |
| The 404 page | pass: the nearest `404.html`, so each folder has its own |
| A single-page fallback | not the platform's per folder; the Worker fetches the folder's index on a 404 for a page request. Not built: no single-page template sits beside this package |
| Conditional and `HEAD` requests | pass: 304 and 200 |
| A `_headers` or `_redirects` file inside a folder | served as text: `assemble` must not copy it |
| The scheduled handler beside assets | pass |
| One frontend, `run_worker_first: ["/api/*"]` | pass: pages, headers, redirects and the 404 page with no Worker code |
| `<dir>.localhost` in Node and Bun | **fails to resolve on Windows**; a browser and curl resolve it. A Node-side check uses `127.0.0.1` and sets the host header |

## Alternatives considered

- **Stay on Pages Functions.** No work now; every new project then starts on the product its
  vendor steers away from, and several frontends need a Pages project each.
- **Keep `functions/` and compile it** with `wrangler pages functions build`. The smallest
  change, on a command of that same product. The owner chose Hono.
- **A Worker per frontend** running the same code. Static files stay free of Worker requests
  and each frontend has its own preview; it is several deployments from the first day. The
  owner ruled one Worker first.
- **Frontends by path** (`/admin/`) on one host. No host map and no local host names; the
  console then shares the public origin, its cookies and its policy, and each build needs a
  base path. ▲ Rejected: the reference project already separates by host.
- **A hand-written router.** No dependency; the module shape of the other two servers, route
  parameters and typed middleware are then ours to maintain.

## Consequences

- A static page costs nothing with one frontend and one Worker request with several.
- `serverless/cloudflare` has the module shape of the two servers again.
- "Can move out later" is tested by the rules above and by no deployment.
- A project on 1.0.0 has a migration to do before it gains a second frontend.

## Out of scope

A module in its own Worker and a Worker per frontend (the guide's recipe). A project's own
move. Sign-in. A second line of the template on Pages. A single-page template beside the
package.
