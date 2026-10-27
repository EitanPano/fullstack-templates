The layer map of this package. Commands are in `package.json`; the contract code in `src/shared/api/generated/` is generated, never edited.

**`src/`**

- `app/`: routing only. `routes.tsx` is the route table (`createRoutes(queryClient)`: route objects and loaders, no router), `root-error.tsx` (the last-resort boundary), `nav.ts`, and route
  groups. `(site)/` holds the shell `layout.tsx`, `page.tsx`, `loading.tsx` (the group's
  `HydrateFallback`), `error.tsx` (its `ErrorBoundary`) and `not-found.tsx` (the catch-all, so a 404
  keeps the shell). A page is a `PageHeader` plus widgets, each inside its own `Suspense`. No
  fetch calls and no business logic in `app/`.

<!-- @server:auth-start -->

`(auth)/` holds the account screens `sign-in/` and `sign-up/`: no shell, a centred `main` in its
`layout.tsx`, and its own `loading.tsx` and `error.tsx`; their loaders send a signed-in account
home. `(site)/forbidden/` is the page `requireRole` sends an account with the wrong role to.

<!-- @server:auth-end -->

- `main.tsx`: creates the query client and the browser router from `createRoutes`, and mounts them
  inside the providers (query, theme, tooltip, toaster), nothing else. Tests render the table in a
  `createMemoryRouter`.
- `widget/<section>/`: a page section. `ui/<section>.tsx` suspends on the entity queries
  (`useSuspenseQuery`) and composes entities and features; `ui/<section>-skeleton.tsx` is its
  loading shape.
- `feature/<action>/`: one user action, a glossary verb. `model.ts` (form schema and copy table),
  `api/` (the mutation hooks), `ui/` (the interactive leaf).
- `entity/<noun>/`: one glossary noun. `model.ts` (types, mappers, labels), `api/<noun>.ts`
  (query options and keys), `ui/` (presentational components such as `HealthBadge`).
- `shared/`: product-agnostic.
  - `ui/` shadcn primitives, `ui/pattern/` layout patterns, `ui/form/` field bindings,
    `ui/theme-provider.tsx`.
  - `lib/`: `cn`, `action-error` (`ActionError`), `date` (zone-aware dates), `zod-messages`.
  - `api/`: `generated/` (Hey API output: types, SDK, fetch client, zod, TanStack Query options;
    committed, lint-ignored), `client.ts` (the client's configuration),
    `call.ts` (`call` and the default copy), `index.ts` (the contract's types).

<!-- @server:auth-start -->

- `auth/`: the session guards (`session.ts`), `RequireRole`, `next-path.ts`. `entity/user`,
  `feature/auth` and `widget/account-menu` are the account's slices. `shared/api/client.ts` also
  holds the 401 refresh, and `shared/api/session-hint.ts` the flag that gates it (see Auth).

<!-- @server:auth-end -->

- `config/env.ts`: the only reader of `import.meta.env`, parsed with zod. Vite compiles every
  `VITE_*` value into the bundle, so a value declared here is public and never a secret.

**Where does X go**

| Addition                                             | Home                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| A domain object's type, mapper, label, badge or card | `entity/<noun>/`                           |
| A read from the API                                  | `entity/<noun>/api/<noun>.ts`              |
| A mutation and the button or form that runs it       | `feature/<action>/`                        |
| A page section that combines reads and actions       | `widget/<section>/`                        |
| A route, its layout, loading and error               | `app/(group)/…` and `app/routes.tsx`       |
| A primitive (button, input, dialog)                  | `shared/ui/`, added with `shadcn add`      |
| A reusable layout pattern                            | `shared/ui/pattern/`                       |
| A form field binding                                 | `shared/ui/form/`                          |
| Formatting and date helpers                          | `shared/lib/`                              |
| A route guard or session helper                      | `shared/auth/` (with the server's auth)    |
| An environment variable                              | `shared/config/env.ts` plus `.env.example` |
| A navigation entry                                   | `app/nav.ts`                               |

**Import rules** (`eslint-plugin-boundaries`; each lint message names the layer to use instead):

- `app` → widget, feature, entity, shared. `widget` → feature, entity, shared. `feature` →
  entity, shared. `entity` → shared. `shared` → shared.
- A slice never imports a sibling slice in its own layer. An entity imports another entity only
  with `import type` from its `model.ts`.
- `shared/api` is imported by `*/api/*` files and `shared/auth`. A `model.ts` may also
  `import type` from `@/shared/api` (the contract's types) and import the generated zod schemas
  from `@/shared/api/generated/zod.gen` (to extend them); nothing else of `shared/api` is
  reachable from `model.ts`, `ui/` or `app/`.
- `button`, `input`, `select` and `textarea` JSX elements are errors outside `shared/ui`: use
  the primitive. A bare `fetch(` is an error outside `shared/api`.
- `import.meta.env` is read only in `shared/config/env.ts`.

`tests/unit/eslint-boundaries.test.ts` lints one violation and one allowed case per rule, in a
throwaway project built from the real `eslint.config.mjs`. A new rule gets a case there. Use
the `@/` alias for every import that crosses a directory; relative imports stay inside one slice.

The API is always reached at relative `/api` on the page's own origin (see Deployment), so the
client takes its base from `window.location.origin` and the bundle carries no API URL.

## Adding a feature

1. Name the noun and the action in `.doc/glossary.md`. The noun is an entity (`entity/<noun>/`
   with `model.ts`, `api/<noun>.ts` and `ui/`); the action is a feature (`feature/<action>/` with
   `model.ts`, `api/<action>.ts` and the leaf in `ui/`). `entity/health`, `feature/refresh-health`
   and `widget/system-status` are the worked example.
2. If the server's contract changed, run `bun run api:types`. `src/shared/api/generated/` is
   regenerated and committed; never edit it. Only `*/api/*` files import the generated SDK,
   options and keys.
3. Compose them in `widget/<section>/ui/<section>.tsx`, which reads with `useSuspenseQuery`, and
   give it a skeleton with the same layout in `<section>-skeleton.tsx`.
4. Add the route in `src/app/(group)/<route>/page.tsx` (a `PageHeader` and the widget inside
   `<Suspense fallback={<…Skeleton />}>`) and in `src/app/routes.tsx`, with a `loader` that
   prefetches what the widget reads. The group's `loading.tsx` and `error.tsx` cover the route;
   add a segment-level pair only when the segment needs its own copy.
5. When the feature adds a top-level screen, add its entry to `src/app/nav.ts` (`{ to, label }`).
6. Configuration comes only through `src/shared/config/env.ts`. A browser-visible value is
   `VITE_*`, declared in the zod schema and listed in the example env file. Never put a secret
   there.
7. Add a primitive with `bunx shadcn@4.21.4 add <name>` (see Styling). Never run `shadcn init`
   or any other scaffolder.

### Reads

TanStack Query with Hey API's generated options. An entity's `api/<noun>.ts` exports a key
function and a query-options function, built from the generated `get…Options` with the query
function replaced by `call(get…({ signal }))`, so a failure is an `ActionError` with our copy:

```ts
export const healthKey = () => getApiHealthQueryKey()
export const healthQuery = () =>
  queryOptions({
    ...getApiHealthOptions(),
    queryFn: ({ signal }) => call(getApiHealth({ signal })),
  })
```

- **The route loader** prefetches: `loader: () => queryClient.query(healthQuery())`. The pinned
  TanStack Query deprecates `ensureQueryData` for `query`, which returns fresh cached data or
  fetches. A failing loader reaches the group's `ErrorBoundary`, which offers a retry.
- **The widget** calls `useSuspenseQuery(healthQuery())` inside `Suspense` with its skeleton. The
  data is already there from the loader; a later refetch that fails reaches the same boundary.
- **Expiry**: a mutation invalidates the keys of the entities it changes
  (`queryClient.invalidateQueries({ queryKey: healthKey() })`), so the widgets show the new value.
- The query client (`main.tsx`) does not retry and treats a read as fresh for 30 s.

### Mutations

A mutation is a hook in `feature/<action>/api/<action>.ts`: `useMutation` with
`mutationFn: () => call(postApiX({ body }), COPY)` and an invalidation on success.

- `call(request, copy, options)` returns the data or throws an `ActionError`. The message is the
  copy table's entry for the envelope's `code`, then the default (Errors). The server's own text
  never reaches the page.
- `options.fields` (`{ conflict: 'email' }`) puts a code on one field; a 400 with details becomes
  `fieldErrors` on those fields (copy key `validation_failed:<path>`). `options.discriminator`
  reads a second key from the envelope when the product's contract adds one
  (`conflict:slot_taken`).
- The component awaits `mutateAsync` in its handler and shows the outcome **after the await**:
  a toast, or `reportFailure(form.setError, error)` for a form. Never fire a toast from an effect.

### Forms

React Hook Form with `zodResolver` and `useMutation`. `SignInForm` is the pattern.

- The schema is in `feature/<action>/model.ts` and extends the generated request schema
  (`zPostApiXBody.extend({ … })`); limits are never copied. A field whose message is ours sets that
  message itself, whatever the generated schema carries (the servers' schemas differ: one has an
  email format check and one has none).
- `<Form form={form} onSubmit={onSubmit}>` provides the context; `TextField`, `TextareaField`,
  `NumberField`, `SelectField`, `CheckboxField`, `PasswordField` and `DateTimeField` (all in
  `shared/ui/form/`) take a `name` and a `label`. An error shows under its field with `aria-invalid`
  and `aria-describedby`; the submit row is `FormActions`.
- `reportFailure(form, error)` puts a failure that has `fieldErrors` on its fields and toasts anything
  else, so a toast never repeats a field error. When none of the error paths is a field of the form
  (a server-only or renamed field), it toasts the message instead of setting an invisible error.

### Dates

`shared/lib/date.ts` (`date-fns` v4 with `@date-fns/tz`) converts between an instant and a wall
time in a named zone; nothing reads the machine's zone. `wallTimeToInstant` refuses a time inside a
daylight-saving gap and takes the earlier instant for an ambiguous one; `dayKey` names the day in
the zone; `formatDate` and `formatDateTime` format in it. A form holds an instant (ISO with `Z`);
`DateTimeField` takes the zone as a prop.

<!-- @server:auth-start -->

### Auth

The API sets its tokens as HttpOnly cookies (`access_token`, `refresh_token`) on the page's own
origin, because every call is same-origin `/api`. The page never reads a token: no JavaScript can.

- **Refresh.** `shared/api/client.ts` wraps `fetch`: a 401 from any endpoint except sign-in,
  sign-up, the OTP calls and the refresh itself becomes one `POST /api/auth/refresh` and one retry
  of the request. Concurrent 401s share the one refresh (the API rotates the refresh token, so a
  second refresh with the old cookie would be a replay). When the refresh fails the original 401 is
  returned and the guards send the visitor to sign-in.
- **The session hint.** The refresh only runs for a browser that signed in. The cookies are
  unreadable, so `shared/api/session-hint.ts` keeps a flag in `localStorage`; without it every
  visitor's session probe would spend one of the API's per-address refresh attempts. Three
  consequences:
  - It never holds a token or user data (the value is `1`), and it is set only after a sign-in or
    sign-up succeeded and cleared on sign-out.
  - A missing hint with valid cookies (storage cleared or blocked) shows the signed-out view until
    the user signs in; nothing is lost and nothing is exposed.
  - A stale hint (the refresh cookie expired or was revoked) costs one refresh: a 400, 401 or 403
    from `POST /api/auth/refresh` clears it (the servers answer 400 `refresh token missing` once
    the browser has dropped the expired cookie). A 429, a 5xx or a network error does not, because
    they say nothing about the cookie.
- **Guards.** `shared/auth/session.ts`: `readSession(queryClient)` asks `GET /api/user/me`
  (fresh for 30 s) and returns the account or `null`, failing closed; `requireAccount(queryClient,
returnTo?)` throws a redirect to `/sign-in?next=…`; `requireRole(queryClient, 'admin', returnTo?)`
  redirects a visitor the same way and an account with another role to `/forbidden`. A route
  loader calls them: `loader: ({ request }) => requireAccount(queryClient, returnToOf(request))`.
  The role is the API's answer, never a claim in a token. The guard keeps a visitor off a screen;
  the API checks every call.
- **`RequireRole`** hides a control from an account without the role. It is cosmetic, not access
  control. Likewise the `noindex` tag of the guarded pages is rendered by the client, so a crawler
  that runs no script ignores it; the loader's guard is the protection.
- `feature/auth/api/auth.ts`: `useSignIn`, `useSignUp`, `useSignOut`. A success stores who signed
  in in the query cache and the hint; the form navigates to a safe `next` path (`safeNextPath`
  accepts only a path on this site). Sign-out clears the cache and the hint whatever the API said.
- **Staff pages.** Put them under a pathless route whose loader calls `requireRole(queryClient,
'admin')`, and give every staff loader the same call. The template ships no staff page: no
  route creates an admin yet.
- The account slot of the shell is `widget/account-menu`. The email is in the menu, never header
  text beside a primary button.

<!-- @server:auth-end -->

## Styling

- Tailwind utility classes only: no new `.css` files beyond `src/app/globals.css`, no inline
  styles. Compose classes with `cn` from `@/shared/lib/cn`.
- **Tokens.** Colours are CSS variables in `globals.css`, in OKLCH: shadcn's semantic set
  (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`,
  `destructive`, each with its `-foreground`) plus `success`, `warning` and `info`, and `border`,
  `input`, `ring`, `radius`. Light values sit in `:root` and dark values in `.dark`; `@theme
inline` maps them to utilities (`bg-primary`, `text-muted-foreground`) and `@custom-variant dark`
  keys `dark:` to the class. The generator writes the values from the brand; edit them there,
  never a literal colour in a component. Spacing is Tailwind's 4 px step (`p-1` 4 px, `p-2` 8,
  `p-4` 16, `p-6` 24); do not add a `--spacing-<n>` key.
- **Theming.** `ThemeProvider` (`shared/ui/theme-provider.tsx`) sets the `dark` class on `<html>`
  from the stored choice or the brand's default and follows the OS for `system`; the toggle is in
  the `UserMenu`. `public/theme-init.js` sets the class before first paint so a dark theme never
  flashes light; it is a file, not an inline script, because the deployed pages carry
  `script-src 'self'`. Keep the two in step (storage key `theme`, same default). Do not add a
  `prefers-color-scheme` block.
- **Sizing.** Controls use the shadcn density on a fine pointer and 44 px under touch:
  `h-9 pointer-coarse:h-11`, icon buttons `size-9 pointer-coarse:size-11`. The density set at
  generation (`data-density` on `<html>`) changes the fine-pointer height only: the `compact:`
  variant is wrapped in `@media (pointer: fine)`, because it ties with `pointer-coarse:` on
  specificity and would otherwise win on touch (`tests/unit/density.test.ts` compiles it). A new
  control follows the same pair. Mobile first: unprefixed utilities are the phone layout; `sm:`,
  `md:` and `lg:` widen it. No page scrolls horizontally at any width.
- **Primitives** live in `src/shared/ui/` (copied shadcn source on Radix, edited freely). The
  one scaffolder an agent may run is `bunx shadcn@4.21.4 add <name>`; afterwards fix what the
  CLI wrote: its `cn` import becomes `@/shared/lib/cn`, literal colours become tokens, sizes get
  the `pointer-coarse:` pair, and run `bun run format`. `components.json` maps `ui` to
  `@/shared/ui`.
- **Patterns** in `src/shared/ui/pattern/`: `AppShell` (skip link, header, nav inline from `md`
  and in a sheet on phones, account slot, one `main`, footer), `Page`, `PageHeader`, `Section`,
  `EmptyState`, `ErrorState` (with retry), `ListSkeleton`, `CardSkeleton`, `AuthCard` (with the
  server's auth), `FormActions` (sticky on phones), `ConfirmDialog` and `UserMenu` (avatar
  trigger, email, items slot, theme choices; the `email` prop is the account menu's, it stays when
  auth is off because the pattern is one component). The nav uses React Router's `NavLink`, which
  sets `aria-current="page"`. Use a pattern before writing a layout by hand. The `(site)` layout
  composes the shell from `app/nav.ts`; a page and the group's `loading.tsx` and `error.tsx`
  render inside it and never add a landmark set. A page sets its title with a `<title>` element.
- **Forms** use the bindings in `src/shared/ui/form/`, never a raw `input`.
- **Status** is a `Badge` by meaning (`success`, `warning`, `destructive`, `muted`, `info`) with
  words or an icon, never colour alone, and never a palette class such as `emerald-100`.
- Toasts use `sonner`: concise and action-oriented ("Status refreshed"). Icons come from
  `lucide-react`, the same icon for the same concept everywhere, `aria-hidden` next to a label.
- Use semantic HTML, labelled controls and keyboard-reachable interactions. The target is WCAG
  2.2 AA, checked by the axe scan in the e2e tests.

## Errors

- Every route has a loading and an error state, its own or its group's: `loading.tsx` (the
  `HydrateFallback`) and `error.tsx` (the `ErrorBoundary`) per route group, `root-error.tsx` for
  what no group caught. A group is a pathless route inside the group's layout, so its boundary
  renders inside the shell. Every widget has a skeleton that matches its layout. Error messages
  are user-safe: no stack trace, no query text, no internal URL or secret. The boundary logs the
  cause with `console.error`; its retry drops the failed queries and re-runs the loaders.
- The generated client does not throw on an HTTP error status: it returns
  `{ data, error, response }`, and on a network failure `response` is undefined and `error` is the
  thrown value. `call` (`src/shared/api/call.ts`) handles both, in that order, and is the only
  place that reads the result. Do not read `error` yourself.
- `call` throws an `ActionError` whose message is copy we wrote. The lookup is the feature's copy
  table by `code` (with a second key when the product's contract adds a discriminator), then the
  default below. The server's `message` is never shown. A 5xx, a missing envelope or an
  unreachable API is logged with its request id first.

  | `code` (status)                  | Default copy                                                 |
  | -------------------------------- | ------------------------------------------------------------ |
  | `validation_failed` (400)        | Check the form and try again. (per field with details)       |
  | `unauthenticated` (401)          | Your session has expired. Sign in again.                     |
  | `forbidden` (403)                | You don't have access to this.                               |
  | `not_found` (404)                | We couldn't find that.                                       |
  | `conflict` (409)                 | That conflicts with something that already exists.           |
  | `rate_limited` (429)             | Too many attempts. Wait a few minutes and try again.         |
  | `internal` (500)                 | Something went wrong on our side. Try again.                 |
  | `upstream_unavailable` (502-504) | The service is unavailable right now. Try again in a moment. |
  | no response                      | Can't reach the server. Check your connection and try again. |

  A feature overrides the entries that need its own words (`SIGN_IN_COPY` maps 401 to "Email or
  password is wrong." because the API cannot tell the two apart by design).

- A query function that goes through `call` throws the `ActionError`; the route's boundary shows
  the generic message. A mutation's handler shows `error.message` (it is our copy) with
  `toast.error`, as `RefreshHealthButton` does.

## Tests

- Unit tests live in `tests/unit/` and run with `bun run test` (Vitest, React Testing Library,
  jsdom). Components: props in, roles and text out, with `userEvent` for input. The API is the one
  boundary: stub the global `fetch` (`stubApi` in `tests/unit/support.tsx` answers by
  `METHOD /path`), so a test goes through the real generated client, `call`, the copy tables and
  the query cache. A route is tested by rendering the table with `renderRoutes` (a memory router
  over `createRoutes`); no test starts the server. Mock `sonner` to assert a toast.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`). `playwright.config.ts`
  starts the API fresh (`reuseExistingServer: false`, `RATE_LIMIT_SCALE=100`) and the production
  build behind `vite preview` on the template's port, which forwards `/api` to that API. Install
  the browser once with `bun x playwright install chromium` (add `--with-deps` on Linux).

<!-- @server:database-start -->

- **E2E database.** The server's `e2eDb` command is chained before its start command, on
  `app_e2e`, because Playwright starts web servers before `globalSetup`; the development database
  is never touched. `E2E_DATABASE_URL` overrides the URL, a blank value takes the default, and a
  name that does not end in `_e2e` is refused when the config loads (`scripts/e2e-database-url.ts`,
  unit tested). Container mode starts no API and skips the check.

<!-- @server:database-end -->

- **Container mode.** With `E2E_BASE_URL` set (a blank value counts as unset), `bun run test:e2e` tests that URL and starts
  nothing. The API there runs at rate-limit scale 1 with one per-address bucket, so the suite can
  run about once per 15 minutes per stack, and it leaves its accounts in that stack's `app`
  database. The catalog's case runner brings a stack up and down with its volumes, so it is
  unaffected.
- **Projects.** `phone` (`devices['Pixel 7']`, touch) runs every journey with its axe scan;
  `desktop` (`devices['Desktop Chrome']`) runs `shell.spec.ts` and `screens.spec.ts`. A check that
  belongs to one of them is tagged `{ tag: '@phone' }` or `{ tag: '@desktop' }` and the other
  project's `grepInvert` leaves it out, so nothing skips at run time. `retries: 0`
  and a trace is kept on failure: a test that passes only on a retry is a failure.
- **Specs.** `shell.spec.ts` asserts the landmarks, the skip link, no horizontal overflow, the
  44 px touch targets (phone) and the shadcn densities (desktop); a `--density compact` build must
  pass its phone tests. `smoke.spec.ts` reaches the API through the page. `auth.spec.ts` (with the
  server's auth) covers sign-up, sign-out, sign-in, a wrong password, a taken email on its field
  and the guarded redirect. `screens.spec.ts` captures every `nav.ts` route (and, with the
  server's auth, sign-in and sign-up) in phone and desktop, light and dark, to `test-results/screens/<route>-<viewport>-
<theme>.png`; QA reads them.
- The data rule: a journey creates its data through the API or the UI with a name unique per run,
  and never takes the database's contents as a precondition.
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
- Browser-visible configuration is `VITE_*`, read in `src/shared/config/env.ts` at build time. Never put a
  secret there.
- **Client address.** `CLIENT_IP_HEADER` is a Next-template setting and does not apply here. The
  browser calls `/api` on this app's own origin, so the server sees the browser's address through
  nginx (`split`, which appends it to `X-Forwarded-For`) or directly (`single`), and the per-address
  rate limits work as the server's `TRUST_PROXY` says. The dev and preview servers do not forward
  the client address, so every request they proxy comes from 127.0.0.1 and a rate-limit test in
  development shares one bucket.
- **Cookies.** The API sets the session cookies `Secure` outside development, so a non-loopback
  host needs TLS at an edge (browsers accept `Secure` cookies on `localhost` over HTTP).
- **Theme script.** `public/theme-init.js` is copied to `dist/` and served as a file; the CSP is
  `script-src 'self'`, so an inline script would be blocked.
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

<!-- @server-start -->

**The lines of each mode.** Switching mode edits exactly these lines, copied from this package's
`compose.yaml`, so they cannot drift. A generated project holds only the lines of its own mode, so
copy the other mode's from here. They sit under this package's service in the root
`docker-compose.yml`, indented four spaces (the generated file may spell the `ports` and
`depends_on` lists with spaces inside the brackets, which is the same YAML). `API_URL` is the
server's Compose service name and port, and `depends_on` names that service. The `Dockerfile` has
both targets in both modes and is not edited. The server's own lines are in its
`AGENTS.md › Deployment`.

Compose, `single`:

```yaml
# A build-only service that the server's build reads as its spa context (Compose 2.35.0 or
# newer). No depends_on (the server's build waits for this one), no environment, no container.
build:
  context: ./__PACKAGE_DIR__
  target: dist
scale: 0
```

Compose, `split` (replaces the `single` lines above):

```yaml
# nginx serves the static files on its own port.
build:
  context: ./__PACKAGE_DIR__
  target: serve
# nginx proxies /api to the server and starts after it.
environment:
  API_URL: http://__SERVER_DIR__:__SERVER_PORT__
ports: ['__PORT__:__PORT__']
depends_on: [__SERVER_DIR__]
profiles: ['app']
```

<!-- @server-end -->
