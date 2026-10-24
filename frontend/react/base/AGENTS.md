The layer map of this package. Commands are in `package.json`; the contract types are generated, never edited.

**`src/`**

- `app/`: routing only. `routes.tsx` (the route table: route objects only, no router), `layout.tsx`, `error.tsx` (the root
  boundary), `not-found.tsx`, and per route segment a directory with `page.tsx`, `loading.tsx`
  (the `HydrateFallback`) and `error.tsx` (the `ErrorBoundary`). A page composes feature
  components and reads its loader's data. No fetch calls and no business logic in `app/`.
- `main.tsx`: builds the browser router from `routes` and mounts it with sonner's `Toaster`, nothing else. Tests render `routes` in a `createMemoryRouter`.
- `feature/<name>/`: one directory per product feature, singular name. `ui/` holds the
  components, `api/` holds the route loaders and actions that call the API client, `model.ts`
  holds types and form schemas.
- `shared/`: `ui/` primitives and `lib/` utilities (`lib/action.ts` holds `ActionResult`, what every route action returns). Product-agnostic; never imports `feature/`.
- `lib/api/`: `client.ts` (the `openapi-fetch` client) and `schema.d.ts` (generated; never
  edited by hand). Only `feature/*/api/` imports the client.
- `env.ts`: the only file that reads `import.meta.env`, parsed with zod. Vite compiles every
  `VITE_*` value into the bundle, so a value declared here is public and never a secret.

Import direction: `app → feature → shared, lib`. Never the reverse. A feature never imports
another feature's `ui/`; lift to `shared/` or pass props. Lint enforces the direction, the
client rule and the `env.ts` rule; `tests/unit/lint-zones.test.ts` seeds one violation per zone.
Lint flags an import of another feature's `ui/` through the `@/feature/<name>/ui` alias at any
depth, and through a relative path from 2 to 4 levels up (a deeper path is not caught). Inside a
feature, import relatively: the alias form is reserved for other directories, and lint flags it
for a feature's own `ui/` too. Reach `shared/` and `lib/` through `@/` (`@/shared/ui/...`),
never a relative path: a deep relative path into `shared/ui` also trips the cross-feature `ui/` rule.
The API is always reached at relative `/api` on the page's own origin (see Deployment), so the
client takes its base from `window.location.origin` and the bundle carries no API URL.
Data reaches a page through its route `loader`, and a mutation goes through a route `action`
or a form; a component never calls `fetch` (a convention, not enforced by lint).

## Adding a feature

1. Create `src/feature/<name>/` (singular) with `model.ts` (types, form schemas), `api/`
   (loaders and actions) and `ui/` (components). `api/` is the only place that imports
   `@/lib/api/client`; lint enforces it. `src/feature/health/` is the worked example.
2. If the server's contract changed, run `bun run api:types`. `src/lib/api/schema.d.ts` is
   generated and never edited by hand.
3. Components are plain function components. A component receives data through props or reads
   its route's `useLoaderData`; it does not fetch.
4. A loader returns a value or throws. A non-2xx answer or a network failure is thrown and the
   route's `ErrorBoundary` renders it (see Errors). An action validates its input, calls the
   API, and returns an `ActionResult`; after an action the router re-runs the loaders.
5. Add the route to `src/app/routes.tsx` and its directory `src/app/<route>/` with `page.tsx`
   (composes the feature and nothing else), `loading.tsx` (set as `HydrateFallback`) and
   `error.tsx` (set as `ErrorBoundary`).
6. Configuration comes only through `src/env.ts`. A browser-visible value is `VITE_*`, declared
   in the zod schema and listed in the example env file. Never put a secret there.

## Styling

- Tailwind utility classes only: no new `.css` files beyond `src/app/globals.css`, no inline
  styles.
- Design tokens are CSS variables in `:root` in `globals.css`, exposed to utilities through
  `@theme inline`. Add a token there instead of a literal colour or size in a component.
- Toasts use `sonner`: concise and action-oriented ("Status refreshed", not "Operation
  completed successfully"). Icons come from `lucide-react`, the same icon for the same
  concept everywhere, with `aria-hidden` when a text label sits next to it.
- Use semantic HTML, labelled controls and keyboard-reachable interactions. The layout owns the
  page's one `<main>`; a page renders its content inside it. The target is WCAG 2.2 AA, checked
  by the axe scan in the e2e tests.

## Errors

- Every new route segment gets an `error.tsx` (the route's `ErrorBoundary`, see
  `src/app/home/error.tsx`) and a `loading.tsx` (its `HydrateFallback`); the root has
  `error.tsx` and `not-found.tsx`. Their messages are user-safe: no stack trace, no query text,
  no internal URL or secret. The boundary logs the cause with `console.error`.
- A loader that cannot produce its data throws, as `loadHealth` does; the boundary offers a
  retry through `useRevalidator`. Return a value instead only for an outcome the page renders as
  part of its normal view.
- A route action returns `ActionResult` from `src/shared/lib/action.ts`: `{ ok: true, data }` or
  `{ ok: false, error }`. The component shows the outcome with `toast.success` or `toast.error`;
  expected failures are values, never exceptions.
- The client from `@/lib/api/client` is `openapi-fetch`: it does not throw on an HTTP error
  status, it returns `{ data, error, response }`. Check `data === undefined` and map the status
  to a message the user can act on; a network failure throws.

## Tests

- Unit tests live in `tests/unit/` and run with `bun run test` (Vitest, React Testing
  Library, jsdom). Components: props in, roles and text out, with `userEvent` for input. A
  route is tested by rendering `routes` in a `createMemoryRouter` with `fetch` stubbed through
  `vi.stubGlobal('fetch', ...)`; no test starts the server. `lint-zones.test.ts` lints one
  seeded violation per ESLint zone: add a seed when you add or change a zone.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`): one test per user
  journey, each with an axe scan. With `E2E_BASE_URL` set, `bun run test:e2e` tests that URL
  and starts no web server; otherwise it starts the server and the Vite dev server through the
  `webServer` entries in `playwright.config.ts`. Install the browser once with
  `bun x playwright install chromium` (add `--with-deps` on Linux).
- Every new behaviour gets a test for the happy path and at least one for a failure or empty
  path. No `.skip`, `.only`, `test.fixme` or `describe.skip`; a removed test is named in the
  stage report.

## Deployment

- `bun run dev` serves the app on port 5173 (`strictPort`) and proxies `/api` to the server's
  port, so the page and the API share one origin in development too. Start the server first, or
  the page shows its error state.
- `bun run build` writes `dist/`: `index.html` at its root and hashed files under
  `dist/assets/`, no source maps. `dist/` holds static files only; any static server that falls
  back to `index.html` for a path without an extension can serve it.
- The app calls the API at relative `/api` on its own origin, in every environment. No API URL
  is compiled into the bundle and there is no CORS. Whatever serves `dist/` must also route
  `/api` to the server (a reverse proxy, or the server serving the files itself).
- Browser-visible configuration is `VITE_*`, read in `src/env.ts` at build time. Never put a
  secret there.
- **Two modes**, chosen at generation (`--deploy`).
  - `single` (default): one container. The server serves `dist/` and `/api` on its own port
    (published on every interface), so the page is on the server's port and `5173` is dev-only.
  - `split`: two containers. This package's nginx serves the files on `5173` (published on every
    interface, the public edge) and proxies `/api/` to the server, which is published on
    loopback only.
- **`Dockerfile` targets.** `build` runs a frozen install and `bun run build`. `dist` is
  `FROM scratch` and holds only the built files at `/dist`: the server's image copies it
  (`COPY --from=spa /dist ./public`). `serve`, the last and so the default target, is
  `nginxinc/nginx-unprivileged:1.31.7-alpine` with the files at `/usr/share/nginx/html`; it runs
  as uid 101, listens on `PORT` (default 5173, above 1024) and has a `wget` healthcheck.
  `.dockerignore` keeps environment files, tests and source maps out of every image.
- **nginx files**, in `nginx/`. `default.conf` is the config template (copied to
  `/etc/nginx/templates/default.conf.template`; the image's entrypoint renders it with
  `envsubst` over `PORT` and `API_URL`). The `@server` markers around its `/api/` proxy are
  resolved at generation, so a frontend generated alone has no proxy block. `security-headers.conf` holds the 12 headers of helmet 8.3.0 and is
  included by each static location. Behaviour: `/assets/*` is `immutable`, `index.html` and
  other files `no-cache`, an extension-less path is `index.html`, a missing file with an
  extension, a dotfile and `/assets/` are 404 (never a listing), a path above the root is
  nginx's own 400, and `/api/` is proxied with `X-Forwarded-For` while the server's own headers
  pass through untouched. Keep three rules when editing: no `add_header` at server level (a
  location with its own drops the inherited ones), no dollar sign in a comment (`envsubst`
  rewrites it), and no environment variable named like an nginx variable (`host`, `uri`).
- **Compose fragment** (`compose.yaml`), per mode. `single`: `build: { context, target: dist }`
  with `scale: 0`, so the image is built and no container runs; the server's build reads it as
  `additional_contexts: spa: service:<dir>`. This needs **Docker Compose 2.35.0 or newer**; an
  older client fails with "pull access denied" or a missing `service:` context. `split`:
  `target: serve`, `ports: ["5173:5173"]`, `API_URL` (the server's name and port on the Compose
  network), `depends_on` the server, and the `app` profile.
- **Run and stop.** `docker compose --profile app up --build --wait`; stop with
  `docker compose --profile app down`, because a plain `down` does not see profile services.
- **`TRUST_PROXY`** is the server's. `single`: `false`, because nothing sits in front of it.
  `split`: `1`, because nginx is the one hop and sets `X-Forwarded-For`. Raise it by one for
  every proxy placed in front of the edge.
- **TLS.** The containers speak HTTP, while the CSP carries `upgrade-insecure-requests` and
  `Strict-Transport-Security`. For any non-loopback host an edge must terminate TLS. In `split`
  nginx sends `X-Forwarded-Proto: $scheme`, always `http` at this hop: behind a TLS edge, change
  that line in the `/api/` location to forward the edge's value (`$http_x_forwarded_proto`), and
  make the server's `TRUST_PROXY` count the edge as well as nginx.
- **Body size.** nginx's `client_max_body_size` is its 1 MB default. Both servers cap a body at
  1 MB too (`express.json({ limit: '1mb' })` in `server.ts`; `MAX_BODY_BYTES` in
  `config/constants.py`), so an oversize body gets nginx's own 413 page, not the server's
  envelope. To accept more, raise the server's limit and set `client_max_body_size` in the
  `/api/` location of `nginx/default.conf` to match.
