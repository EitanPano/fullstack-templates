# Frontend

<!-- @noserver-start -->

The layer map of this package: a static Astro site. Commands are in `package.json`. What holds for
the whole repository (versions, definition of done) is in the repository's root `AGENTS.md`.

<!-- @noserver-end -->
<!-- @server-start -->

The layer map of this package: a static Astro site that reaches its API at relative `/api`. Commands
are in `package.json`; the contract code in `src/services/generated/` is generated, never edited.
What holds for the whole repository (versions, definition of done) is in the repository's root
`AGENTS.md`.

<!-- @server-end -->

## Layer map

- `src/pages/`: one `.astro` file per route (`about.astro` is `/about`; the build writes
  `about.html`, no trailing slash) with its `.scss` beside it. `index.astro` is the index route (one
  `h1`, one line of copy: replace it) and `404.astro` the page served, with status 404, for a path
  no page owns.
- `src/layouts/`: `base-layout.astro` is the document shell every page shares: the head, the skip
  link (first in the tab order) and the page's one `<main id="main">`, which fills the rest of a
  viewport-high column. No header, navigation, footer, theme toggle or toast region: those are
  product code, placed around the slot.
- `src/components/`: one folder per component with its `.scss` (and its `.ts` when it has
  behaviour) beside it. `ui/` is the kit (`button`, `field`, `input`, `card`, `alert`, `spinner`,
  `skeleton`, `toast`, `theme-toggle`). Anything a product adds sits beside it, never in a second
  components folder.
<!-- @islands-start -->
- `src/components/islands/<name>/`: React islands, only with the `islands` flag (see Islands).
<!-- @islands-end -->
- `src/services/`: the data and library layer. `validation.ts` is the one file that names `zod`;
  `theme.ts` is the facade over the browser's storage and colour-scheme query.
<!-- @server-start -->
- `src/services/generated/` is the client the `contract` command writes from the server's
  `openapi.json` (types, a fetch client, the flat SDK and zod schemas); `api-client.ts` is its
  configuration (relative `/api` on the page's origin); `api.ts` is the one wrapper over it
  (`request`, the error mapping); `error-copy.ts` looks an envelope code up in its copy table;
  `forms.ts` shows an envelope's field errors on a form. An entity's calls are
  `services/<entity>.ts`.
<!-- @server-end -->
- `src/models/<entity>/{interface,type,enum,constant}.ts`: a noun's types and constants, in those
  four files only (`interface.ts` holds interfaces, `type.ts` type aliases). Here: `nav/`, `theme/`
  and `ui/` (the kit's copy).
<!-- @server-start -->
- `src/models/api/` (the `ApiError`) and `src/models/error/` (the envelope's copy table).
<!-- @server-end -->
- `src/styles/`: the global token tree (see Styling). `src/nav.ts` is the one table of top-level
  routes; the e2e screen list reads it.
- `public/`: files copied to the build as they are: `theme-init.js` (the no-flash theme script, a
  file, never inline), the favicon and a host's own files (`_headers`, `_redirects`).
- `tests/unit/` (Vitest) and `tests/e2e/` (Playwright); `astro.config.mjs`, `tsconfig.json`,
  `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`.

Behaviour is a `<script>` in a page or a component, which Astro bundles; there is no UI framework in
the base. A content page ships no script but `theme-init.js`.

## Import rules

Enforced by `eslint.config.mjs` and proved by `tests/unit/eslint-boundaries.test.ts`, which lints one
violation and one allowed case per rule; each message names the layer to use instead.

- `pages/` import layouts, components, services and models; nothing imports a page. `layouts/`
  import components, services and models. `components/` import services and models. `services/`
  import models. `models/` import models only. `nav.ts` imports models only.
<!-- @server-start -->
- Only `src/services/` imports the generated client at run time; any layer may `import type` from
  it. A call to the API is a function in `services/<entity>.ts` built on `request` from
  `services/api.ts`, and a page script imports that.
<!-- @server-end -->
- `zod` is imported only by `src/services/validation.ts` (and by generated code). A control
  (`button`, `input`, `select`, `textarea`) outside `src/components/ui/` fails lint, in markup and
  through `createElement`, so a new kind of control is a new kit folder. `fetch` is called nowhere in
  `src/`.
- `import.meta.env` and `process.env` are read only in `src/env.ts` (browser-visible `PUBLIC_`
  values, never a secret). The file does not exist until a value needs it.
- No inline event-handler attribute and no `style` attribute: the policy has no `'unsafe-inline'`.
- Not enforced (review): a component imports nothing of the page that places it; copy for a visitor
  is a constant in `models/`, never inline in a script.

## Commands

`bun run check` is every gate and needs no Docker or account: `astro check` (types, `.astro` files
included), ESLint, Prettier and Vitest. `bun run dev` serves on port 4321 with reload. `bun run
build` writes `dist/`. `bun run test:e2e` builds, then runs Playwright (install its browser once
with `bunx playwright install chromium`).
<!-- @server-start -->

`bun run dev` proxies `/api` to the API package's dev server (`vite.server.proxy` in
`astro.config.mjs`). `bun run api:types` (the `contract` command) regenerates
`src/services/generated/` from the server's `openapi.json`; commit the result and read the diff.

<!-- @server-end -->

## Adding a feature

A feature is a page. The base ships no page that calls the API and no form (no example screen), so
this is the recipe, file by file, test first.

1. `src/nav.ts`: one entry, if the page is a top-level route (`tests/e2e/screens.spec.ts` captures it
   with no further edit; a route outside the nav goes in `EXTRA_ROUTES` in
   `tests/e2e/screen-routes.ts`).
2. `src/models/<entity>/{interface,type,enum,constant}.ts`, only for what the contract does not give
   (a label table, a view type). Copy for a visitor is a constant here.
<!-- @server-start -->
3. `src/services/<entity>.ts`: one function per call, `request(() => <sdk function>({ ...,
   throwOnError: true }))` from `services/api.ts`. The SDK function, its parameters and its
   response are typed by the contract; write no API type by hand. A failure rejects with an
   `ApiError`.
4. `tests/unit/<entity>.test.ts`, red first: the service against a stubbed `fetch`
   (`vi.stubGlobal`; the generated client calls the global `fetch`), the happy path and an envelope
   failure.
<!-- @server-end -->
5. `src/pages/<name>.astro` on `base-layout.astro` with its `<name>.scss` beside it, using the kit.
   A page has exactly one `h1`, inside `<div class="page-container">`.
<!-- @server-start -->
6. A page with a form:
   - A real `<form method="post">` with a kit `Field` and `Input` per control (the label, the hint
     and the `data-field-error` region are the kit's), native constraints read off the generated zod
     schema (`stringLimits(zCreateThingBody.shape.name)` for `minlength` and `maxlength`, never a
     copied number) and a `Button type="submit"`.
   - A `<script>` that attaches the submit handler, calls `event.preventDefault()`, reads the
     fields, calls the service and, on failure, shows the envelope: `applyFieldErrors(form, error)`
     from `services/forms.ts` for the fields it names and one `showToast(errorMessage(error.code),
     'error')` for the rest (the copy table, never the server's `message`). It never navigates on
     failure, and the toast fires from the handler after the await.
   - The last line of the script calls `markReady(form)`, which sets `data-ready`. A test waits for
     `form[data-ready]` before it submits: a form submitted before its handler is attached does a
     plain GET with its fields in the query string.
   - A route that fetches shows a `Skeleton` until the call settles, with `aria-busy` on the region,
     and an `Alert` (error tone) when it fails.
   - A module that imports the generated zod schemas imports `services/validation.ts` first
     (`tests/unit/validation-first.test.ts`), so zod's eval probe is off before a schema is built.
7. `tests/e2e/<name>.spec.ts`: the journey on `phone`, with data named uniquely per run and removed
   through the API afterwards; `screens.spec` covers the screen itself.
<!-- @server-end -->
8. This file and the README's Features: say what the page does.

Nothing private is rendered at build time: a page for a signed-in visitor is a static shell that
fetches and shows a skeleton until it settles. A static page cannot be gated; the API does that.

**The kit** (`src/components/ui/`): `button` (a button, or a link that looks like one with `href`;
variants `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`, `icon`), `field` (`id`,
`label`, `hint?`, `error?`, the control in the slot), `input` (`id`, `hint?`, `invalid?`, native
attributes), `card`, `alert` (`tone`), `spinner`, `skeleton`, `toast` (the region once in the
layout; `showToast(message, kind)` from `toast.ts`) and `theme-toggle` (a product places it; the
base layout does not). Each is tested once in `tests/unit/kit.test.ts`: add a new component there.

## Adding a content page

A page that only shows content ships no script but `theme-init.js`.

1. `src/pages/<name>.astro` on `base-layout.astro`: one `h1`, the content inside
   `<div class="page-container">`. The file name is the path (`about.astro` is `/about`; the build
   writes `about.html` and a host serves `/about` with no redirect).
2. `src/pages/<name>.scss` beside it, imported in the frontmatter, if the page needs rules.
3. An entry in `src/nav.ts`; `tests/unit/nav.test.ts` checks the page exists and the screens spec
   captures it in both themes and both viewports (axe, one `h1`, no overflow).
4. Content that changes without a deploy is an endpoint the page fetches, not a build-time read.

<!-- @islands-start -->

## Islands

The `islands` flag adds `@astrojs/react` (the integration line in `astro.config.mjs`), `react` and
`react-dom`. The template ships no island: write one when a page needs client behaviour that a
`<script>` cannot reasonably hold (state shared by several controls, a widget with its own
rendering).

- An island is `src/components/islands/<name>/<name>.tsx`; a page imports it and hydrates it with a
  directive. Prefer `client:visible` or `client:idle`; `client:load` only for what is on screen at
  once; never `client:only` for content a crawler should read.
- Logic stays in `services/` (the island imports it); the island holds markup and state.
- The policy has no `'unsafe-inline'`: an island has no `style` prop and no inline event-handler
  attribute (lint refuses both). Hydration is covered by the hashed policy, and a React event
  handler (`onClick={fn}`) is not an inline attribute. Size and colour come from a class in the
  island's sibling `.scss`.
- An island is a component for the import rules: it imports services and models, never a layout or
  a page. A raw element is a React element there, so an island writes `<button>` itself; the kit's
  Astro components cannot render inside it.
- Check an island in a build: it hydrates, with no Content-Security-Policy violation and no console
  error, through `bun run test:e2e` (add an e2e journey for it).

<!-- @islands-end -->

## Styling

Tokens, not literals. The global tree is `src/styles/` and nothing else: `styles.scss`, `setup/`
(variables, breakpoints, functions, mixins, typography, `_layers.scss`), `themes/` (`brand.css`
holds the generated brand tokens and is never edited; `_light.scss` and `_dark.scss` the product's
additions) and `basics/` (helpers, base, layout). `styles.scss` declares `@layer setup, themes,
basics;` first; a component's sheet sits beside it, is imported by its file, is never layered and so
wins over the global tree whatever the bundler's order (`tests/unit/styles.test.ts`).

- **Tokens.** Colour, radius and font come from the custom properties (`var(--primary)`,
  `var(--surface-2)`, `var(--focus-ring)`); never a literal colour. Light values sit in `:root`, dark
  values under `[data-theme='dark']`. `public/theme-init.js` is a file, never inline, and sets
  `data-theme` on `<html>` before first paint; `services/theme.ts` and the `theme-toggle` keep it in
  step. The brand inputs are the generator's.
- **No inline style.** No `<style>` element and no `style=` attribute in a template: Astro would hash
  the element, and an attribute is refused by `style-src`. Write a class in the sibling `.scss`.
  Never write a whole-line `// @word` comment in SCSS: the generator reads it as a marker.
- **Logical properties only** (`margin-inline`, `padding-block`, `inline-size`, `text-align: start`),
  so the layout mirrors under `dir="rtl"`. Breakpoints `sm` 576, `md` 768, `lg` 1024, `xl` 1280,
  `xxl` 1536, mobile first (`@include up(md)`); spacing on a 4 px base (`space()`).
- **44 px.** Every control spans at least 44 px under `(pointer: coarse)`, whatever `data-density`
  says: `@include touch-target` on any new control. No horizontal overflow at any viewport. Compact
  density tightens spacing, never a touch target.
- **The shell.** `base-layout.astro` is the skip link, the page's one `<main id="main">` and nothing
  else (see Layer map). `main` has no width and no padding; a page takes `.page-container` or leaves
  it out.
- **The theme control** is `src/components/ui/theme-toggle`. **Controls** are the kit's alone (lint,
  see Import rules). **Fonts** are the brand's `font` input: the system stack, or Inter from
  `@fontsource-variable/inter`, self-hosted by the build; no third-party font host, because the
  policy's `font-src` is `'self'`.
- **The policy.** `security: { csp: true }` hashes every script and style of the build into a
  `<meta http-equiv="content-security-policy">` on each page: `script-src` and `style-src`, with
  `'self'` and hashes, never `'unsafe-inline'`. A script goes in a `<script>` Astro bundles, never
  `is:inline` with a body (it is not hashed). The policy does not run in `astro dev`: test it on the
  build (`bun run test:e2e`). zod is told not to probe `new Function` (`services/validation.ts`),
  which the policy would report. Do not write `default-src`, `frame-ancestors` or the like into
  `security.csp`: beside `serverless/cloudflare` its assemble step sets them in the header.

## Errors

<!-- @noserver-start -->

Generated alone, the site has no API code: nothing here applies until a server is added. When one
is, `contract` generates the client and the rules below arrive with it.

<!-- @noserver-end -->
<!-- @server-start -->

The server answers every failure with one envelope (`{ "error": { "code", "message", "details"? },
"requestId" }`; `ErrorBody` in `src/services/generated/types.gen.ts`). The page never shows the
server's `message`.

- `services/api.ts` is the one wrapper. Its error interceptor on the generated client turns a failed
  response into an `ApiError`: the envelope's `code`, the `status`, the `requestId` (keep it for a
  support line) and, for a `validation_failed`, the `fieldPaths` the server names. A code the
  contract does not know, or a body that is no envelope, is `unknown`; a thrown fetch is `network`;
  a check that failed before any request is `validation`. A 401 or a 403 is an envelope error like
  any other: there is no refresh logic and no session (the base has no accounts).
- The code maps through the copy table `src/models/error/constant.ts` (`errorMessage(code)` in
  `services/error-copy.ts`). The table is typed over the contract's codes, so a code added to the
  contract fails the build until it has copy, and `tests/unit/error-copy.test.ts` checks the table
  against the generated schema of the error body (the functions add `method_not_allowed`).
- A field the envelope names shows `FIELD_ERROR_COPY` (`applyFieldErrors`); the paths that name no
  field get one `error` toast of `errorMessage('validation_failed')`.
- The toast fires from the handler after the await, never from code that runs on load. Every route
  that fetches shows a skeleton while it loads and an `Alert` when it fails.

<!-- @server-end -->

## Tests

`bun run test` is Vitest in Node (a file that needs a DOM starts with the
`// @vitest-environment jsdom` comment): the layout, every kit component once through Astro's container (`kit.test.ts`), `nav.ts`,
the theme logic and script, the styles tree, the import boundaries, the Playwright config and a real
`astro build` into a throwaway folder (`build.test.ts`: the index page references no script but
`theme-init.js`, every page carries the hashed policy). A page itself is covered by the e2e suite.
<!-- @server-start -->

The data layer is tested against a stubbed `fetch` (`api.test.ts`, `forms.test.ts`,
`error-copy.test.ts`), and `build.test.ts` also proves that no text of the server package reaches
the build.

<!-- @server-end -->

- **E2E** (`bun run test:e2e`: builds, then Playwright). `phone` (`Pixel 7`) and `desktop`
  (`Desktop Chrome`) projects, `retries: 0`, `reuseExistingServer: false`. With `E2E_BASE_URL` set
  (a blank value counts as unset) nothing is started.
<!-- @noserver-start -->
  Otherwise the web server is `astro preview` on port 4321 serving the built site.
<!-- @noserver-end -->
<!-- @server-start -->
  Otherwise the one web server is the server package's own chain, run in its directory with
  `RATE_LIMIT_SCALE=100`: its `e2eDb`, then its `start`, which assembles this build with the
  functions and serves both on one origin. The base URL is that origin.
<!-- @server-end -->
  A test tagged `@phone` or `@desktop` belongs to one project; never a runtime `test.skip`.
  `shell.spec` (skip link, one `main`, overflow, 44 px targets, density, console, policy),
  `screens.spec` (every nav route and the 404 page, both themes, axe WCAG A and AA, no horizontal
  scroll, one `h1`, no policy violation, screenshots in `test-results/screens/`) and `smoke.spec`
  (the index page, the 404 page and its status; with a server also the API through `fetch` from the
  page: health with a request id, a static page with none, the JSON 404, the reference module's
  create and list). Helpers: `tests/e2e/support.ts`. A journey names its data uniquely per run and
  removes it through the API.
- Tests first: write the failing test, see it red, then the code; each behaviour has a happy path
  and a failure or empty one. Never delete, skip or focus a test.

## Deployment

The build output is static HTML in `dist/` (`bun run build`): any static host serves it. A host's own
files (`_headers`, `_redirects`, `robots.txt`) pass through `public/`; Cloudflare Pages reads
`_headers` and `_redirects`. The `_headers` file here holds only the immutable cache rule for
`/_astro/*`, because Pages merges the rules of every file that matches and a header set twice is
sent twice. Alone, the policy is the meta tag on each page (hashed `script-src` and `style-src`, no
`'unsafe-inline'`); a host that sends headers adds `default-src`, `frame-ancestors` and the rest
itself.

<!-- @server-start -->

Beside `serverless/cloudflare` that package serves and deploys the site: its `assemble` step copies
this build into its own `dist/`, merges the `_headers` and `_redirects` files and lifts the pages'
policy into one `Content-Security-Policy` header with the directives a meta tag cannot carry.
`bun run build` here must finish before its `start` runs (`bun run test:e2e` does that). The
deployment, the Pages project and its build command are in that package's `AGENTS.md › Deployment`.
This package never reads a secret or an account.

<!-- @server-end -->
