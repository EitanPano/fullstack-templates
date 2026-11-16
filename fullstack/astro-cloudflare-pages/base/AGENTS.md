# App

The layer map of the one package: static Astro pages, Pages Functions and the schemas they
share, shipped to Cloudflare Pages with a D1 database. What holds for the whole repository
(versions, commands, definition of done) is in the repository's root `AGENTS.md`; nothing here
repeats it. This file ships with the package and an agent working in it loads it.

## Layer map

| Path                                                                                                       | What it is                                                                                                                                                                                                                                                                                   | Lane     |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `src/`                                                                                                     | `pages/` (index, 404), `layouts/base-layout.astro`, `components/ui/` (the kit), `services/` (`api.ts`, `validation.ts`, `error-copy.ts`, `forms.ts`, `theme.ts`), `models/<entity>/` (copy tables and the page's own types), `styles/` (the token tree), `nav.ts`; static output, no adapter | frontend |
| `public/`                                                                                                  | `_routes.json`, `_headers` (static headers; the policy is added to `dist/_headers` by the build), `_redirects`, `theme-init.js`, static files                                                                                                                                                | frontend |
| `functions/`                                                                                               | File path = route. `_middleware.ts` wraps every function; a route file is its gate chain and the call to a controller, nothing else                                                                                                                                                          | backend  |
| `server/api/<module>/`                                                                                     | `controller.ts` (the module's public API and its HTTP handlers), `service.ts` (its queries), `model.ts` (its Drizzle table)                                                                                                                                                                  | backend  |
| `server/middleware/`                                                                                       | `handler.ts` (`handle`, `Context`, `Gate`, `rootMiddleware`), `validate`, `rate-limit`, `error-handler`, `request-id`, `request-log`, `body`                                                                                                                                                 | backend  |
| `server/config/`                                                                                           | `env.ts` (the bindings as validated configuration), `constants.ts` (policy)                                                                                                                                                                                                                  | backend  |
| `server/models/<name>/`                                                                                    | `interface.ts`, `type.ts`, `enum.ts`, `constants.ts` of one entity                                                                                                                                                                                                                           | backend  |
| `server/services/`                                                                                         | `logger.ts`, `security/crypto.ts`, `utils/` (pure: time, pagination, error, encoding, client address)                                                                                                                                                                                        | backend  |
| `server/infra/`                                                                                            | `bindings.ts` (the typed bindings), `db.ts` (Drizzle over `DB`), `tables.ts` (the rate-limit table)                                                                                                                                                                                          | backend  |
| `shared/`                                                                                                  | `schemas/<module>.ts` (zod: what the route validates and the page types its call with), `types/api.ts` (the envelope, error codes, `Page`)                                                                                                                                                   | backend  |
| `migrations/`                                                                                              | SQL from `drizzle-kit generate`, applied by `bun run migrate`                                                                                                                                                                                                                                | backend  |
| `scripts/`                                                                                                 | `dev.mjs`, `start.mjs`, `e2e-db.mjs`, `csp-headers.mjs` (after `astro build`)                                                                                                                                                                                                                | both     |
| `tests/`                                                                                                   | `api/` (workerd, through the real routing), `unit/` (Node: pure code, the lint boundaries, the config files, the CSP script; `unit/page/` the page half), `e2e/` (Playwright)                                                                                                                | qa       |
| `wrangler.jsonc`, `worker-configuration.d.ts`, `drizzle.config.ts`, `tsconfig.server.json`, `.env.example` | platform and tool configuration                                                                                                                                                                                                                                                              | backend  |

`server/` uses only the web platform's `Request` and `Response` and the bindings type: it
imports no Pages type, so a move to Workers replaces `functions/` and `public/_routes.json` only.
Environment values come from the request's bindings, validated once per isolate in
`server/config/env.ts`; nothing reads `process.env` (lint) and nothing keeps a connection at
module level.

## Request flow

`functions/_middleware.ts` runs `rootMiddleware` around every function: it gives the request an
id (honouring a well-formed `x-request-id`), turns a thrown error into the envelope, sets the
response headers (`x-request-id`, `x-content-type-options: nosniff`, `referrer-policy`,
`cache-control: no-store` unless the handler set one) and writes one JSON log line (method, path
without the query, status, duration, request id). A static page never reaches it:
`public/_routes.json` includes `/api/*` only.

A route file exports `onRequest<Method> = handle(...gates, controller)` and
`onRequest = methodNotAllowed(...methods)`; an unknown `/api/*` path falls to
`functions/api/[[path]].ts` (the `not_found` envelope).

```ts
// functions/api/module/index.ts
export const onRequestGet = handle(validate(listModuleRequest), listModule)
export const onRequestPost = handle(
  rateLimit({ name: 'createModulePerIp', ...RATE_LIMITS.createModulePerIp, key: byIp }),
  validate(createModuleRequest),
  createModule,
)
export const onRequest = methodNotAllowed('GET', 'POST')
```

- **`Context`** (`middleware/handler.ts`), one object per request, passed to every gate and the
  controller: `request`, `url`, `env` (the validated configuration), `bindings` (the raw platform
  bindings), `db` (Drizzle over `DB`), `params`, `input`, `requestId`, `log` (bound to the request
  id) and `waitUntil`.
- **A gate** is `(ctx) => void | Response | Promise<...>`. It throws an `AppError` to refuse,
  returns a `Response` to answer in place of the controller (the rest of the chain is skipped), or
  returns nothing to continue. A gate fills a slot it owns: `validate` sets `ctx.input`.
  A gate that identifies the caller adds one `caller` field to `Context` and sets it (the `auth`
  flag does).
- **A controller** is `(ctx) => Response | Promise<Response>`. It reads the validated input with
  `readInput(ctx, <operation>Request)`, throws an `AppError` for a refusal, and answers with
  `json(body, status)` or `noContent()`.
- Order: rate limit, then `validate`, then the controller. A 429 does not wait for parsing and a
  controller never sees unparsed input.

## Import direction

Enforced by `eslint.config.mjs` (zones plus specifier bans, so an alias cannot dodge them) and
proved by `tests/unit/boundaries.test.ts`; each message names the layer to use instead.

- `src/` imports `shared/` only. `server/` and `functions/` never import `src/`. `shared/` imports
  none of the three.
- `functions/` imports controllers, `server/middleware/`, `server/config/` and `shared/`.
- Inside `server/`: `models/` and `shared/` are leaves; `config/` imports nothing of `server/`;
  `services/utils/` is pure; `services/` never imports `middleware/` or `api/`; `infra/` imports
  `config/` and `models/` only; `middleware/` never imports `api/`.
- A module's `service.ts` and `model.ts` are imported only inside that module, and the data layer
  never imports `middleware/` (it never sees HTTP). Another module is reached through its
  `controller.ts` only, from a `controller.ts`.
- The one path alias is `@shared/*` (both tsconfigs, the vitest config). `functions/` and
  `server/` import each other by relative path, because the platform's function bundler resolves
  aliases from the root `tsconfig.json` only.
- Not enforced (review): a route file holds nothing but gates and one controller call; a rule
  another module needs is an exported typed function of the controller, never a handler.

## Commands

`bun run check` is every gate and needs no Docker or account: `wrangler types --check`,
`astro check`, `tsc` on the server, test and e2e projects, `eslint`, `prettier --check`, then every
test. `bun run test:db` runs the API project alone. `bun run migrate` applies the migrations to the
local database (`.wrangler/state`). `bun run e2e:db` rebuilds a separate state folder
(`.e2e-state`) and `bun run start` serves the build on it; `bun run dev` never reads it.
`bun run dev` serves the pages with Astro on 4321 and proxies `/api` to `wrangler pages dev`
on 8788; `bun run start` serves everything on 8788 (it builds first when `dist/` is missing).
`bun run build` is `astro build` then `scripts/csp-headers.mjs`; `bun run test:e2e` builds, then runs
the Playwright suite (see Tests). Install its browser once with `bunx playwright install chromium`.
After a `wrangler.jsonc` change run `bun run types`: the generated types embed its values.

## Adding a module

Work in this order, test first.

1. `shared/schemas/<name>.ts`: the zod schemas, the value sets and limits, one
   `<operation>Request` object per endpoint (only the parts it reads), and the inferred types.
2. `server/models/<name>/`: `interface.ts` (the stored record), `type.ts`, `enum.ts` and
   `constants.ts` re-export what `shared/` defines, so nothing is declared twice.
3. `tests/api/<name>.test.ts`, red (see Tests).
4. `server/api/<name>/model.ts` (the table), then `bun run db:generate -- --name <name>` and
   `bun run migrate` (see Adding the data layer).
5. `service.ts`: queries taking `db` as their first parameter.
6. `controller.ts`: one handler per endpoint, then the rules other modules need.
7. `functions/api/<name>/index.ts` and `[id].ts`: the gate chain and the controller call, plus
   `onRequest = methodNotAllowed(...)`. Add the table of a new module to
   `drizzle.config.ts` only if it is outside `server/api/*/model.ts`.
8. `bun run check`.

Start by copying `server/api/module/`, `server/models/module/`, `shared/schemas/module.ts`,
`functions/api/module/` and `tests/api/module.test.ts`, renaming `module` to `<name>`, `Module`
to `<Name>`. Drop the reference module (those paths and its migration's table) once a real one
exists.

- One request object, two readers: `validate(<operation>Request)` in the route file and
  `readInput(ctx, <operation>Request)` in the handler.
- Every endpoint is public until the `auth` flag adds the gates; a route that needs a caller
  refuses without one.
- A list paginates: `PageQuery` and `pageOf` from `shared/schemas/page.ts`, the service fetches
  `limit + 1` rows and `toPage` slices, the cursor is opaque. Paths are singular
  (`/api/post`, `/api/post/{id}`), bodies JSON only. Statuses: 200 read and update, 201 create
  (the created resource), 204 delete (no body), 400 validation, 404 missing, 405 wrong method,
  409 conflict, 429 rate limited.
- Ids are made in the controller (`crypto.randomUUID()`).

## Adding the data layer

D1 through Drizzle is part of the base. A table is `server/api/<module>/model.ts`; the platform
layers' own tables are `server/infra/tables.ts`.

- Timestamps are `integer({ mode: 'timestamp_ms' })` columns (epoch milliseconds, read back as
  `Date`). Table and column names are snake_case singular, fields camelCase in code.
- `bun run db:generate -- --name <name>` writes the SQL into `migrations/`; commit it with the
  model. Never edit an applied migration: add a new one. `bun run migrate` applies it locally.
- D1 has no interactive transaction. A rule that must not race is one conditional statement
  (`UPDATE ... WHERE ... RETURNING`, an upsert) or one `db.batch([...])`. The rate limiter is one
  upsert with `RETURNING count`.
- A query takes the `db` of the context. `infra/db.ts` builds the client from the request's `DB`
  binding; nothing is cached at module level.
- Remote databases are created and migrated by a person with `wrangler d1`; no script of the
  template does it. `wrangler.jsonc` names a separate database per Pages environment, with fake
  ids to replace.

## Adding a feature

A feature is a page that reads or writes through the API. The base ships no form and no page that
calls the API (no example screen), so this is the recipe, file by file, test first. Behaviour is a
`<script>` in the page, which Astro bundles (it may import `src/services/`); there is no UI
framework. The module's server half is under Adding a module.

1. `src/nav.ts`: one entry, if the page is a top-level route (`tests/e2e/screens.spec.ts` captures
   it with no further edit; a route outside the nav goes in `EXTRA_ROUTES`,
   `tests/e2e/screen-routes.ts`).
2. `src/services/<entity>.ts`: one function per call, built on `request` or `send` from
   `services/api.ts`. Type each call with the schemas of `shared/schemas/<entity>.ts`: the
   argument is `Input<typeof CreateXBody>`, the response schema is passed as `response`, and
   `request` parses every success body (always, in development and in production: a contract
   drift fails where it happens). No hand-written API type; `Input` and `Output` come from
   `services/validation.ts`.
3. `src/models/<entity>/{interface,type,enum,constant}.ts`, only for what `shared/` does not give
   (a label table, a view type). Copy for a visitor is a constant here, never inline in a script.
4. `tests/unit/page/<entity>.test.ts`, red first: the service against a stubbed `fetch`
   (happy path and an envelope failure), and the copy if you added any.
5. `src/pages/<name>.astro` on `base-layout.astro` with its `<name>.scss` beside it, using the kit
   (`src/components/ui`). A page that needs an `h1` has exactly one.
6. The form, if there is one:
   - A real `<form method="post">` with a `Field` and `Input` per control (the label, the hint
     and the `data-field-error` region are the kit's), native constraints mirrored from the shared
     schema (`stringLimits(CreateXBody.shape.name)` for `minlength` and `maxlength`, never a
     copied number) and a `Button type="submit"`.
   - A `<script>` that attaches the submit handler, calls `event.preventDefault()`, reads the
     fields, calls the service, and on failure shows the envelope: `applyFieldErrors(form, error)`
     from `services/forms.ts` for the fields it names, one `showToast(errorMessage(error.code),
'error')` for the rest (the copy tables, never the server's `message`). It never navigates
     on failure, and the toast fires from the handler after the await, never from code that runs
     on load.
   - The last line of the script calls `markReady(form)`, which sets `data-ready`. A test waits
     for `form[data-ready]` before it submits: a form submitted before its handler is attached
     does a plain GET with its fields in the query string (the catalog once shipped that).
   - Every route that fetches shows a skeleton (`Skeleton`) until the call settles, with
     `aria-busy` on the region, and an `Alert` (error tone) when it fails.
7. `tests/e2e/<name>.spec.ts`: the journey on `phone` (data named uniquely per run, removed through
   the API afterwards); `screens.spec` covers the screen itself.
8. `AGENTS.md` and the README's Features: say what the page does.

Nothing private is ever rendered at build time: a page for a signed-in visitor is a static shell
that fetches and shows a skeleton until it settles. A static page cannot be gated; the API does
that (the gate chain, `Adding a module`).

**The kit** (`src/components/ui/`, each a folder with its `.scss`): `button` (a button, or a link
that looks like one with `href`; variants `primary`, `secondary`, `ghost`, `danger`; sizes `sm`,
`md`, `icon`), `field` (`id`, `label`, `hint?`, `error?`, the control in the slot), `input`
(`id`, `hint?`, `invalid?`, native attributes), `card`, `alert` (`tone`), `spinner`, `skeleton`,
`toast` (the region, once in the layout; `showToast(message, kind)` from `toast.ts`) and
`theme-toggle` (a product places it; the base layout does not). A control (`button`, `input`,
`select`, `textarea`) outside `src/components/ui/` fails lint, in a template and in a script
(`createElement`); a new control kind is a new kit folder. `zod` is imported only by
`services/validation.ts` and `fetch` only by `services/api.ts`.

## Adding a content page

A page that only shows content ships no script but `theme-init.js`.

1. `src/pages/<name>.astro` on `base-layout.astro`: one `h1`, the content inside
   `<div class="page-container">`. The file name is the path (`about.astro` is `/about`; no
   trailing slash, `build.format: 'file'`).
2. `src/pages/<name>.scss` beside it, imported in the frontmatter, if the page needs rules.
3. An entry in `src/nav.ts`; `tests/unit/page/nav.test.ts` checks the page exists and the screens
   spec captures it in both themes and both viewports (axe, one `h1`, no overflow).
4. Content that changes without a deploy is an endpoint (`Adding a module`) the page fetches, not
   a build-time read.

## Styling

Tokens, not literals. The global tree is `src/styles/` and nothing else: `styles.scss`, `setup/`
(variables, breakpoints, functions, mixins, typography, `_layers.scss`), `themes/` (`brand.css`
holds the generated brand tokens, `_light.scss` and `_dark.scss` the product's additions) and
`basics/` (helpers, base, layout). `styles.scss` declares `@layer setup, themes, basics;` first;
a component's sheet sits beside it, is imported by its frontmatter, is never layered and so wins
over the global tree whatever the bundler's order (`tests/unit/page/styles.test.ts`).

- **Tokens.** Colour, radius and font come from the custom properties (`var(--primary)`,
  `var(--surface-2)`, `var(--focus-ring)`); never a literal colour. Light values sit in `:root`,
  dark values under `[data-theme='dark']`. `public/theme-init.js` is a file, never inline (the
  policy has no `'unsafe-inline'`), and sets `data-theme` on `<html>` before first paint;
  `services/theme.ts` and the `theme-toggle` keep it in step. Brand inputs are the generator's.
- **No inline style.** No `<style>` element and no `style=` attribute in a template: Astro would
  hash the element, and an attribute is refused by `style-src`. Write a class in the sibling
  `.scss`. Never write a whole-line `// @word` comment in SCSS: the generator reads it as a marker.
- **Logical properties only** (`margin-inline`, `padding-block`, `inline-size`, `text-align:
start`), so the layout mirrors under `dir="rtl"`. Breakpoints `sm` 576, `md` 768, `lg` 1024,
  `xl` 1280, `xxl` 1536, mobile first (`@include up(md)`); spacing on a 4 px base (`space()`).
- **44 px.** Every control spans at least 44 px under `(pointer: coarse)`, whatever
  `data-density` says: `@include touch-target` on any new control. No horizontal overflow at any
  viewport. Compact density tightens spacing, never a touch target.
- **The shell.** `base-layout.astro` is the skip link, the page's one `<main id="main">` filling a
  viewport-high column, and nothing else: header, navigation, footer, the theme toggle and the
  toast region are product code, placed around the slot. `main` has no width and no padding; a
  page takes `.page-container` or leaves it out.
- **The theme control** is `src/components/ui/theme-toggle`. **Controls** are the kit's alone
  (see Adding a feature). **Fonts** are the brand's `font` input: the system stack, or Inter from
  `@fontsource-variable/inter`, self-hosted by the build; no third-party font host, because the
  policy is `font-src 'self'`.
- **The policy** (`security: { csp: true }`, then `scripts/csp-headers.mjs` after `astro build`)
  hashes every script and style of the build into one `Content-Security-Policy` line of
  `dist/_headers`: `default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`,
  `object-src 'none'`, `form-action 'self'`, `connect-src 'self'`, `img-src 'self' data:`,
  `font-src 'self'` and the hashed `script-src` and `style-src`. Never put the policy in
  `public/_headers` (the hashes change every build) and never add `'unsafe-inline'`: a script goes
  in a `<script>` Astro bundles, never `is:inline` with a body. The build fails when the line is
  over Pages' 2000 characters or `_headers` has over 100 rules. It does not run in `astro dev`:
  test it on the build (`bun run test:e2e`). `zod` is told not to probe `new Function`
  (`services/validation.ts`), which the policy would report.

## Errors

Every non-2xx response is the one envelope, built in `server/middleware/error-handler.ts` and
nowhere else:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "invalid body",
    "details": [{ "path": "name", "message": "..." }]
  },
  "requestId": "..."
}
```

- A handler throws `new AppError(code, message, details?, { headers? })`; `code` maps to a status
  (`shared/types/api.ts`, `server/services/utils/error.ts`): `validation_failed` 400,
  `unauthenticated` 401, `forbidden` 403, `not_found` 404, `method_not_allowed` 405 (with `Allow`),
  `conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415, `rate_limited` 429 (with
  `Retry-After`), `internal` 500, `upstream_unavailable` 503.
- A ZodError that escapes is a 400. Anything else is logged with its stack and leaves as a bare
  `internal` envelope: no message, stack or query text reaches the client.
- Only a 401 for a request with no valid access token carries `WWW-Authenticate: Bearer`
  (`authenticationRequired()`); every other 401 carries none.
- Logging is `ctx.log` (one JSON line per call; a field whose key looks secret prints
  `[redacted]`). Never put a header, a body or a secret in a field.
- Health: `GET /api/health` (no store) and `GET /api/health/ready` (pings D1, 503 with the map).

**In the page.** `services/api.ts` is the one `fetch`: a relative `/api` path on the page's own
origin, JSON both ways, and every failure an `ApiError` with the envelope's `code`, the `status`,
the `requestId` (kept for support: show it in a support line, never the server's `message`) and the
`fieldPaths` of a `validation_failed`. A 401 or a 403 is an envelope error like any other; there
is no refresh logic and no session (the base has no accounts). The codes the page itself produces
are `network`, `unknown` (a response that is not the envelope, or a body that fails its shared
schema) and `validation` (a check that failed before any request).

- The code maps through the copy table `src/models/error/constant.ts` (`errorMessage(code)` in
  `services/error-copy.ts`); the record type fails the build when a code is added to
  `shared/types/api.ts` without copy, and `tests/unit/page/error-copy.test.ts` checks every code of
  the shared types and of the server's error module.
- A field the envelope names shows `FIELD_ERROR_COPY` (`applyFieldErrors`); the paths that name no
  field get one `error` toast of `errorMessage('validation_failed')`.
- The toast fires from the handler after the await, never from code that runs on load.
  Every route that fetches has a skeleton while it loads and an error state (`Alert`) when it fails.

## Tests

`bun run test` runs two vitest projects. `unit` runs in Node (`tests/unit/`): pure code, the
import boundaries, `wrangler.jsonc`, the CSP script, and the page half in `tests/unit/page/`
(typed by the root `tsconfig.json`, with DOM types; a file that needs a DOM starts with
`// @vitest-environment jsdom`). `api` runs in workerd (`tests/api/`, `bun run test:db`): a global
setup builds the functions once (`wrangler pages functions build`), and every test sends a
request to that built worker, through the real routing and the root middleware, against a D1 with
the migrations applied. Bindings for the run (`ENVIRONMENT: test`) are in `vitest.config.ts`.

- `tests/api/helpers.ts`: `send(path, { method, body, headers })` returns the `Response`;
  `json(response)` reads it; `through(handler, path, { bindings, params })` runs one handler built in
  the test under the root middleware, for what no route exercises (a probe that throws, a
  production environment, a broken database).
- Storage is isolated per test file, not per test: `tests/api/setup.ts` empties every table
  before each test. A new table needs nothing there.
- **The page half.** A service is tested against a stubbed `fetch` (`vi.stubGlobal`), a form
  helper in jsdom, a kit component by rendering it once through Astro's container
  (`tests/unit/page/kit.test.ts`: add the new component there), the copy tables by the coverage
  test, `src/nav.ts` by `nav.test.ts`. A page itself is covered by the e2e suite.
- **E2E** (`bun run test:e2e`: builds, then Playwright). `phone` (`Pixel 7`) and `desktop`
  (`Desktop Chrome`) projects, `retries: 0`, `reuseExistingServer: false`. The web server is
  `bun run e2e:db && bun run start` with `RATE_LIMIT_SCALE=100` on port 8788: the built site on a
  rebuilt `.e2e-state` database, pages and `/api` on one origin. With `E2E_BASE_URL` set nothing
  is started. A test tagged `@phone` or `@desktop` belongs to one project; never a runtime
  `test.skip`. `shell.spec` (skip link, one `main`, overflow, 44 px targets, density, console,
  CSP), `screens.spec` (every nav route and the 404 page, both themes, axe WCAG A and AA, no
  horizontal scroll, one `h1`, screenshots in `test-results/screens/`), `smoke.spec` (one origin:
  health with a request id, a static page with none, the JSON and the HTML 404, the reference
  module's create and list through `fetch`), `build.spec` (reads `dist/`: no script but
  `theme-init.js`, no text of `server/` or `functions/`). Helpers: `tests/e2e/support.ts`
  (`expectNoAxeViolations`, `screenProblems`, `setTheme`, `collectConsoleProblems`,
  `watchCspViolations`). A journey names its data uniquely per run and removes it through the API.
- A test never starts a listener of its own and never calls a remote binding. Tests first: write the
  failing test, see it red, then the code; each behaviour has a happy path and a failure or
  empty one. Never delete, skip or focus a test.

## Deployment

The target is Cloudflare Pages: `astro build` writes `dist/`, Pages serves it and the functions
on one origin. `wrangler.jsonc` carries `ENVIRONMENT` and a D1 binding for development, `preview`
and `production` (Pages environments do not inherit bindings, and the preview database differs
from production's). No secret is in the file or in the template; production secrets are set by a
person, in the dashboard or with `wrangler secret`. Local overrides go in a `.env` file (see
`.env.example`); never create a `.dev.vars` beside it: where that file exists, `.env` is ignored
whole. No script of the template deploys, logs in or reaches a remote binding, and an agent never
runs `wrangler deploy`, `login`, `secret` or any command with `--remote`.
