The layer map of this package. Commands are in `package.json`; the contract code in `src/shared/api/generated/` is generated, never edited.

**`src/`**

- `app/`: routing only. The root `layout.tsx` (document, theme, toaster), `global-error.tsx`,
  `not-found.tsx`, `nav.ts`, and route groups. `(site)/` holds the shell layout, `page.tsx`,
  `loading.tsx`, `error.tsx`, `not-found.tsx` and a catch-all that keeps a 404
  inside the shell. A page is a `PageHeader` plus widgets, each inside its own `Suspense`. No
  fetch calls and no business logic in `app/`.

<!-- @server:auth-start -->

`(auth)/` holds the account screens `sign-in/` and `sign-up/`: no shell, a centred `main` in its
`layout.tsx` that sends a signed-in account home (`GuestOnly`), and its own `loading.tsx` and
`error.tsx`. `(site)/forbidden/` is the page `requireRole` sends an account with the wrong role to.
`proxy.ts` (in `src/`) keeps the session fresh.
<!-- @server:auth-end -->

- `widget/<section>/`: a page section. `ui/<section>.tsx` is an async Server Component that
  loads through entity loaders and composes entities and features; `ui/<section>-skeleton.tsx`
  is its loading shape.
- `feature/<action>/`: one user action, a glossary verb. `model.ts` (form schema and copy table),
  `server/action.ts` (`'use server'`), `ui/` (the interactive leaf, `'use client'`, which imports
  its own `../server/action`).
- `entity/<noun>/`: one glossary noun. `model.ts` (types, mappers, labels), `server/<noun>.ts`
  (read loaders), `ui/` (presentational components such as `HealthBadge`).
- `shared/`: product-agnostic.
  - `ui/` shadcn primitives, `ui/pattern/` layout patterns, `ui/form/` field bindings.
  - `lib/`: `cn`, `safe-action` (the action clients), `action-error` (`ActionError`), `date`
    (zone-aware dates), `zod-messages`.
  - `api/`: `generated/` (Hey API output: types, SDK, fetch client, zod; committed, lint-ignored),
    `client.ts` (`createApi`), `call.ts` (`call` and the default copy), `index.ts` (the contract's
    types).

<!-- @server:auth-start -->

- `auth/`: the session and cookies (`session.ts`, `cookies.ts`, `refresh.ts`, `token.ts`,
  `next-path.ts`). `entity/user`, `feature/auth` and `widget/account-menu` are the account's
  slices.

<!-- @server:auth-end -->

- `config/env.ts`: the only reader of `process.env`, parsed with zod; browser-visible values
  are `NEXT_PUBLIC_*`.

**Where does X go**

| Addition                                             | Home                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| A domain object's type, mapper, label, badge or card | `entity/<noun>/`                           |
| A read from the API                                  | `entity/<noun>/server/<noun>.ts`           |
| A mutation and the button or form that runs it       | `feature/<action>/`                        |
| A page section that combines reads and actions       | `widget/<section>/`                        |
| A route, its layout, loading and error               | `app/(group)/…`                            |
| A primitive (button, input, dialog)                  | `shared/ui/`, added with `shadcn add`      |
| A reusable layout pattern                            | `shared/ui/pattern/`                       |
| A form field binding                                 | `shared/ui/form/`                          |
| Formatting and date helpers                          | `shared/lib/`                              |
| A server-only auth check                             | `shared/auth/` (with the server's auth)    |
| An environment variable                              | `shared/config/env.ts` plus `.env.example` |
| A navigation entry                                   | `app/nav.ts`                               |

**Import rules** (`eslint-plugin-boundaries`; each lint message names the layer to use instead):

- `app` → widget, feature, entity, shared. `widget` → feature, entity, shared. `feature` →
  entity, shared. `entity` → shared. `shared` → shared.
- A slice never imports a sibling slice in its own layer. An entity imports another entity only
  with `import type` from its `model.ts`.
- A `'use client'` file imports from `server/` only an `action.ts` (or types).
- `shared/api` is imported by `*/server/*` files. A `model.ts` may also
  `import type` from `@/shared/api` (the contract's types) and import the generated zod schemas
  from `@/shared/api/generated/zod.gen` (to extend them); nothing else of `shared/api` is
  reachable from `model.ts`, `ui/` or `app/`.
- `button`, `input`, `select` and `textarea` JSX elements are errors outside `shared/ui`: use
  the primitive. `revalidatePath` and a bare `fetch(` are errors outside `shared/api`.
- `process.env` is read only in `shared/config/env.ts`.

`tests/unit/eslint-boundaries.test.ts` lints one violation and one allowed case per rule, in a
throwaway project built from the real `eslint.config.mjs`. A new rule gets a case there. Use
the `@/` alias for every import that crosses a directory; relative imports stay inside one slice.

Server Components are the default; `'use client'` goes only on leaf components that need
state, effects or browser APIs. Data reaches client components through props or a server
action, never through `fetch` in the browser.

## Adding a feature

1. Name the noun and the action in `.doc/glossary.md`. The noun is an entity (`entity/<noun>/`
   with `model.ts`, `server/<noun>.ts` and `ui/`); the action is a feature
   (`feature/<action>/` with `model.ts`, `server/action.ts` and the `'use client'` leaf in `ui/`).
   `entity/health`, `feature/refresh-health` and `widget/system-status` are the worked example.
2. If the server's contract changed, run `bun run api:types`. `src/shared/api/generated/` is
   regenerated and committed; never edit it. Only `*/server/*` files
   import `@/shared/api/client` and the SDK functions.
3. Compose them in `widget/<section>/ui/<section>.tsx`, an async Server Component, and give it a
   skeleton with the same layout in `<section>-skeleton.tsx`.
4. Add the route in `src/app/(group)/<route>/page.tsx`: a `PageHeader` and the widget inside
   `<Suspense fallback={<…Skeleton />}>`. The group's `loading.tsx` and `error.tsx` cover the
   route; add a segment-level pair only when the segment needs its own copy.
5. When the feature adds a top-level screen, add its entry to `src/app/nav.ts`.
6. Configuration comes only through `src/shared/config/env.ts`. A browser-visible value is
   `NEXT_PUBLIC_*`, declared in a separate public schema, and listed in the example env file.
7. Add a primitive with `bunx shadcn@4.21.4 add <name>` (see Styling). Never run `shadcn init`
   or any other scaffolder.

### Reads

A widget is a request-time hole. `next.config.ts` turns on Cache Components, so the static shell of
a route is built once and everything that needs data streams in at request time. The image build
has no API, so no data is fetched at build.

- **Public data** (the same for every visitor): the entity loader starts with `'use cache'`, then
  `cacheTag('<noun>')` and `cacheLife('<profile>')` (`seconds`, `minutes`, `hours`, `days`),
  then `call(getApiX({ client: createApi() }))`. No `try/catch` in the loader: it throws on failure
  (a thrown loader is never cached) and Next's prerender signals must pass through. Cookies and
  headers are forbidden inside `'use cache'` (the build fails); read them outside and pass the
  value in.
- **The widget**: `await connection()` is its first line, then the loader. It catches in a helper
  (not around JSX), calls `unstable_rethrow(error)`, and renders `ErrorState` with the
  `ActionError` message. `SystemStatus` is the pattern.

<!-- @server:auth-start -->

- **Per-user data**: a loader with no `'use cache'`. It takes the token from
  `const { accessToken } = await requireAccount('/path')` and builds `createApi({ accessToken })`;
  reading cookies makes the widget dynamic, so it sits inside `Suspense` like any other.

<!-- @server:auth-end -->

- **Expiry**: a mutation calls `updateTag('<noun>')` (Server Actions only), never `revalidatePath`.
  The next render reads fresh data, in the same response, so the person sees their own write.
  Use `refresh()` from `next/cache` only to re-render an uncached read.
- The cache store is in memory, per server instance (see Deployment).

### Mutations

`shared/lib/safe-action.ts` holds the client every action starts from: `action`.

```ts
// feature/<action>/server/action.ts
'use server'
export const renamePost = action.inputSchema(renamePostSchema).action(async ({ parsedInput }) => {
  const post = await call(
    patchApiPostById({
      client: createApi(),
      path: { id: parsedInput.id },
      body: { title: parsedInput.title },
    }),
    RENAME_POST_COPY,
    { schema: renamePostSchema },
  )
  updateTag('post')
  return post
})
```

- An action builds its client with `await createRequestApi()` (it adds the visitor's address when
  `CLIENT_IP_HEADER` is set); a public cached loader uses plain `createApi()`.
- `call(request, copy, options)` returns the data or throws an `ActionError`. The message is the
  copy table's entry for the envelope's `code`, then the default (Errors). The server's own text
  never reaches the browser.
- `options.schema` lets a 400 with details become errors on those fields, and
  `options.fields` (`{ conflict: 'email' }`) puts a code on one field instead of a toast.
  `options.discriminator` reads a second key from the envelope when the product's contract adds
  one (`conflict:slot_taken`).
- `handleServerError` returns an `ActionError`'s message as `serverError` and logs and masks
  everything else.
- A page that redirects after a success does it in the action (`redirect()`), after cookies are set.

<!-- @server:auth-start -->

- For a signed-in account start from `accountAction`: it reads the session on every call, refuses
  with "Sign in to continue." when there is none, and puts it in `ctx.session` (use
  `createRequestApi({ accessToken: ctx.session.accessToken })`). `roleAction('admin')` adds a role check
  and refuses with "You don't have access to this.".

<!-- @server:auth-end -->

### Forms

React Hook Form with `zodResolver`, wired by `useHookFormAction` (from
`@next-safe-action/adapter-react-hook-form/hooks`). `SignInForm` is the pattern.

- The schema is in `feature/<action>/model.ts` and extends the generated request schema
  (`zPostApiXBody.extend({ … })`); limits are never copied. A field whose message is ours sets
  that message itself, whatever the generated schema carries (the servers' schemas differ: one has
  an email format check and one has none; `feature/auth/model.ts` runs both checks in one
  `superRefine`). The same schema goes to `.inputSchema` and to `zodResolver`.
- `<Form form={form} onSubmit={ignoreNavigation(handleSubmitWithAction)}>` provides the context; `TextField`,
  `TextareaField`, `NumberField`, `SelectField`, `CheckboxField`, `PasswordField` and
  `DateTimeField` (all in `shared/ui/form/`) take a `name` and a `label`. An error shows under its
  field with `aria-invalid` and `aria-describedby`; the submit row is `FormActions`.
- A field error from the server arrives as `validationErrors` and is placed on the field by the
  adapter. The toast reports the outcome (`serverError`, a success) and never repeats a field
  error, except an error for a field the form does not have (a server-only or renamed field),
  which the adapter cannot show: `unplacedMessage(error.validationErrors, (path) => hasField(form,
  path))` returns its text for the toast. Toasts fire from `actionProps` callbacks or handlers after
  the await, never from an effect.
- `ignoreNavigation` (`shared/ui/form/action-form.ts`) wraps the submit handler of every form. An
  action that ends in `redirect()` makes `executeAsync` reject with Next's navigation error, and
  `<form onSubmit>` drops the promise; the wrapper ignores errors whose `digest` starts with
  `NEXT_REDIRECT`, `NEXT_NOT_FOUND` or `NEXT_HTTP_ERROR_FALLBACK` and rethrows anything else.

### Dates

`shared/lib/date.ts` (`date-fns` v4 with `@date-fns/tz`) converts between an instant and a wall
time in a named zone; nothing reads the machine's zone. `wallTimeToInstant` refuses a time inside a
daylight-saving gap and takes the earlier instant for an ambiguous one; `dayKey` names the day in
the zone; `formatDate` and `formatDateTime` format in it. A form holds an instant (ISO with `Z`);
`DateTimeField` takes the zone as a prop.

<!-- @server:auth-start -->

### Auth

The API's tokens live in this server's own HttpOnly cookies, `access_token` and `refresh_token`
(path `/`, `SameSite=Lax`, `Secure` when `NODE_ENV` is `production`, lifetimes from the API's
`accessExpiresAt` and `refreshExpiresAt`). The browser never talks to the API and never holds a
token in JavaScript.

- `proxy.ts` refreshes: when the access token is missing or expired (`exp` is read without
  verifying, the API verifies) and a refresh token exists, it calls `POST /api/auth/refresh` with
  the token in the body, rotates both cookies, and hands the new ones to the same request's render.
  A refusal (400, 401, 403) clears both cookies; an outage or a rate limit changes nothing. Two
  concurrent requests in one process share one refresh. It never redirects and never checks
  permissions.
- `shared/auth/session.ts` is the data access layer: `readSession()` (memoised per request with
  React `cache`) asks `GET /api/user/me` with the cookie's token as a bearer and returns
  `{ user, accessToken }` or `null`, failing closed; `requireAccount(returnTo?)` redirects a
  visitor to `/sign-in?next=…`; `requireRole('admin', returnTo?)` redirects a
  visitor the same way and an account with another role to `/forbidden` (a plain page, no
  experimental Next API). The role is the API's answer, never a claim
  in the token.
- `feature/auth/server/action.ts`: `signUp`, `signIn` and `signOut`. A success sets the cookies and
  redirects to a safe `next` path (`safeNextPath` accepts only a path on this site); `signOut`
  clears the cookies even if the API cannot be reached.
- **Guarding a page.** Every page and every loader that needs an account calls `requireAccount()`;
  every page and loader limited to a role calls `requireRole(role)`. A layout re-renders only
  when its segment changes, so a layout check alone does not protect a navigation: check in the
  page and in the loader as well. Actions use `accountAction` or `roleAction(role)`.
- **Staff pages.** Put them in a `(site)/(staff)` group whose `layout.tsx` calls
  `requireRole('admin')`, and call it again in every page and loader. The template ships no staff
  page: no route creates an admin yet.
- The account slot of the shell is `widget/account-menu` (a request-time hole). The email is in the
  menu, never header text beside a primary button.

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
- **Theming.** `next-themes` (`attribute="class"`, default from the brief) sets `dark` on
  `<html>`; the toggle is in the `UserMenu`. Do not add a `prefers-color-scheme` block.
- **Sizing.** Controls use the shadcn density on a fine pointer and 44 px under touch:
  `h-9 pointer-coarse:h-11`, icon buttons `size-9 pointer-coarse:size-11`. The density set at
  generation (`data-density` on `<html>`) changes the fine-pointer height only: the `compact:`
  variant is wrapped in `@media (pointer: fine)`, because it ties with `pointer-coarse:` on
  specificity and would otherwise win on touch (`tests/unit/density.test.ts` compiles it). A new control
  follows the same pair. Mobile first: unprefixed utilities are the phone layout; `sm:`, `md:`
  and `lg:` widen it. No page scrolls horizontally at any width.
- **Primitives** live in `src/shared/ui/` (copied shadcn source on Radix, edited freely). The
  one scaffolder an agent may run is `bunx shadcn@4.21.4 add <name>`; afterwards fix what the
  CLI wrote: its `cn` import becomes `@/shared/lib/cn`, literal colours become tokens, sizes get
  the `pointer-coarse:` pair, and run `bun run format`. `components.json` maps `ui` to
  `@/shared/ui`.
- **Patterns** in `src/shared/ui/pattern/`: `AppShell` (skip link, header, nav inline from `md`
  and in a sheet on phones, account slot, one `main`, footer), `Page`, `PageHeader`, `Section`,
  `EmptyState`, `ErrorState` (with retry), `ListSkeleton`, `CardSkeleton`,
  `AuthCard` (with the server's auth), `FormActions` (sticky on phones), `ConfirmDialog` and `UserMenu` (avatar trigger, email, items
  slot, theme choices; the `email` prop is the account menu's, it stays when auth is off because
  the pattern is one component). Use a pattern before writing a layout by hand. The `(site)` layout composes
  the shell from `app/nav.ts`; a page, `loading.tsx` and `error.tsx` render inside it and never add
  a landmark set.
- **Forms** use the bindings in `src/shared/ui/form/`, never a raw `input`.
- **Status** is a `Badge` by meaning (`success`, `warning`, `destructive`, `muted`, `info`) with
  words or an icon, never colour alone, and never a palette class such as `emerald-100`.
- Toasts use `sonner`: concise and action-oriented ("Status refreshed"). Icons come from
  `lucide-react`, the same icon for the same concept everywhere, `aria-hidden` next to a label.
- Use semantic HTML, labelled controls and keyboard-reachable interactions. The target is WCAG
  2.2 AA, checked by the axe scan in the e2e tests.

## Errors

- Every route has a loading and an error state, its own or its group's: `loading.tsx`,
  `error.tsx` and `not-found.tsx` per route group, `global-error.tsx` at the root. Every widget has
  a skeleton that matches its layout. Error messages are user-safe: no stack trace, no query
  text, no internal URL or secret. The cause stays in the server log.
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

- A public cached loader lets the `ActionError` propagate; the widget renders `ErrorState`. An
  unexpected error is thrown and reaches the nearest `error.tsx`.
- Every server action is an `action` client: `ActionError` becomes `serverError`, anything else is
  logged by `handleServerError` and becomes "Something went wrong. Try again." The client leaf shows
  `serverError` with `toast.error` from its handler, as `RefreshHealthButton` does.

## Tests

- Unit tests live in `tests/unit/` and run with `bun run test` (Vitest, React Testing
  Library, jsdom). Components: props in, roles and text out, with `userEvent` for input.
  Async widgets render as `render(await Widget())`. Loaders and actions run with the API stubbed
  through `vi.stubGlobal('fetch', ...)`; no test starts the server. `server-only` is aliased to
  `tests/stub/server-only.ts` in `vitest.config.mts` so server code can be imported. Mock a server
  action module (`vi.mock`) in a component test.
- Next request APIs are boundaries: mock `next/cache` (`cacheTag`, `cacheLife`, `updateTag`),
  `next/server` (`connection`) and `next/headers` (`cookies`). `'use cache'` is inert under Vitest, so
  assert the directives' calls (`cacheTag('health')`) instead. A safe action is called as a function
  and returns `{ data, serverError, validationErrors }`; a `redirect()` surfaces as an error whose
  `digest` starts with `NEXT_REDIRECT`.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`): one test per user
  journey, each with an axe scan (`support.ts` has the scan; `auth-support.ts` the sign-up, sign-in
  and sign-out helpers). Install the browser once with `bun x playwright install chromium` (add
  `--with-deps` on Linux). Scan a settled page: a closed menu, the account slot past its skeleton.
- `bun run test:e2e` tests the **production build**, not the dev server. Playwright starts two web
  servers, both with `reuseExistingServer: false` (stop a dev server on port 3000 first):
  - the API, fresh every run, with `RATE_LIMIT_SCALE=100` so the suite does not trip the rate limits,
    started with the server's start command (`commands.start`);
  - this app: `scripts/e2e-server.mjs` runs `bun run build`, copies `.next/static` and `public/`
    into `.next/standalone` and runs `server.js`, the server the image runs. `next start` would
    also work but warns under `output: 'standalone'`.

<!-- @server:database-start -->

- With a database the API gets the browser-test database, `app_e2e` (the provider's `e2e` URL;
  `E2E_DATABASE_URL` overrides it; a blank value is ignored and a name not ending in `_e2e` is refused
  when the config loads), never the development one. The API's command is
  `<server e2eDb> && <server start>`: `e2eDb` creates `app_e2e` when missing, migrates it and
  truncates it, and refuses a name that does not end in `_e2e`. It runs inside the web server command
  and not in a `globalSetup`, because Playwright starts its web servers **before** global setup and the
  API would connect to a database that does not exist yet. Start the database service first
  (`docker compose up -d --wait <service>` at the project root); no `migrate` is needed.

<!-- @server:database-end -->

- `E2E_BASE_URL` set (a blank value counts as unset): nothing is started and the tests target that origin (the catalog's case runner
  sets it against the Compose stack, `withApp`). There the API is the production one, with its normal
  rate limits and its own database, so the journeys register few accounts. The limit is 10 registrations
  per 15 minutes for the one shared per-IP bucket, and a run sends six: run it once per 15 minutes per
  stack. It leaves six users in that stack's `app` database.
- Playwright has two projects: `phone` (`Pixel 7`, touch) runs every spec, so every journey and its axe
  scan run on the phone; `desktop` (`Desktop Chrome`) runs `shell.spec.ts` and `screens.spec.ts` only.
  A check for one project carries a `@phone` or `@desktop` tag and the other project filters it out
  with `grepInvert` in `playwright.config.ts`; never `test.skip` at run time.
  `retries` is 0 and a trace is kept for a failed test: a flaky test is diagnosed, not retried.
- `tests/e2e/shell.spec.ts` asserts 44 px targets on `phone` only (`@phone`; the navigation sits behind
  the menu button there), the shadcn densities on `desktop` (`@desktop`), and that `data-density="compact"` does not shrink
  a touch target (it sets the attribute `--density compact` generates, so no second build is needed).
- `tests/e2e/screens.spec.ts` writes a full-page screenshot of every route in `app/nav.ts`, and of
  the sign-in and sign-up screens when the server has auth, to
  `test-results/screens/<route>-<viewport>-<theme>.png` (`phone` and `desktop`, `light` and `dark`; the
  home route is `home`). QA reads them as the evidence of how the product looks. A route added to
  `nav.ts` is captured without touching the spec; a screen that is not in the nav is added to its `ROUTES`.
- `tests/unit/eslint-boundaries.test.ts` is the lint test (see the import rules above).
- A journey creates its data through the UI with an email unique to the run (`uniqueEmail()`), and
  never takes the database's contents as a precondition.

<!-- @server:auth-start -->

- The server rate-limits sign-up, sign-in and refresh per address (10 registrations and 10 sign-ins
  per 15 minutes, 30 refreshes) and sign-in per email (5 per 15 minutes). A journey that registers
  uses a unique email and does not loop over sign-ups.

<!-- @server:auth-end -->

- `tests/unit/use-cache.test.ts` fails when a file with `'use cache'` imports `next/headers`,
  `@/shared/auth/*` or `createRequestApi`; `tests/unit/proxy-config.test.ts` pins which paths the
  proxy matcher refreshes.
- Every new behaviour gets a test for the happy path and at least one for a failure or empty
  path. No `.skip` or `.only`; a removed test is named in the stage report.

## Deployment

Upgrade note: every Next option this template sets (`cacheComponents`, `partialPrefetching`) is a
stable top-level option in 16.4.2; no `experimental` flag is used. Re-check the two when bumping Next.

Next is always deployed `split`: `--deploy single` is refused for this template because it declares no
`static` output, and a Next stack records `deploy: split` in provenance. The package has no `STATIC_DIR`,
and it is not served by the server.

- **Image.** Multi-stage `Dockerfile`: a frozen install, `bun run build`, then only Next's
  standalone output, its static files and `public/` are copied. The container runs as the
  non-root `node` user and listens on `3000`. The build needs no API: every data widget is a
  request-time hole.
- **Compose service.** The root `docker-compose.yml` builds the package from its `Dockerfile`
  under the `app` profile, so `docker compose --profile app up --build` starts it. With a server
  in the plan it gets `API_URL` (the server's name and port on the Compose network) and waits
  for the server. Stop it with `docker compose --profile app down`: a plain `down` does not see
  profile services.
- **Port.** Published as `3000:3000`, which Docker binds on every interface; the default is for a
  local run. In production only a proxy you control may reach it (see the production recipe below);
  the server behind it is published on loopback only. API calls are made by the Next.js server
  through `API_URL`, not by the browser.
- **`TRUST_PROXY`.** Not read here. The server's Compose service defaults it to `1` because this
  server counts as the one proxy hop in front of it. Anything placed in front of this container
  adds a hop: raise the server's `TRUST_PROXY` to match.
- **Client address.** By default this package forwards no `X-Forwarded-For` to the API: Next passes a
  client-sent header through unchanged, so forwarding it blindly would let a visitor pick the
  address the API rate-limits. Every request then reaches the API from this server's address, and
  the API's per-address limits are **one bucket for the whole site**: with the server's auth that is
  10 registrations and 10 sign-ins per 15 minutes and 30 refreshes for all visitors together, so one
  script can lock everybody out of sign-up and sign-in (the per-email sign-in limit, 5 per 15
  minutes, still applies per account). **The cap.** Without `CLIENT_IP_HEADER` the refresh budget
  (30 per 15 minutes) and the sign-in budget (10 per 15 minutes) are shared by all visitors, and an
  access token lives 15 minutes, so about 30 active signed-in visitors per 15 minutes is the
  ceiling. Past it a refresh answers 429, the expired session is not renewed, the visitor is sent to
  sign-in, and sign-in answers 429 too. `createApi({ clientHeaders })` forwards the RIGHTMOST entry of
  `CLIENT_IP_HEADER` as `X-Forwarded-For` (anything that is not an IP address is dropped), and the
  server's `TRUST_PROXY` must count this server as a hop. Public cached loaders never forward.
- **Production recipe (one place).** A TLS proxy you control in front (the Cookies bullet needs it
  anyway); the Next port reachable only from that proxy (publish it to the proxy's network or as
  `127.0.0.1:3000:3000`, not to the internet); and `CLIENT_IP_HEADER` set, in the shell environment
  Compose reads, to the header that proxy overwrites or appends with the visitor's address
  (`x-forwarded-for` or `x-real-ip`; a value that is not a header name stops the server at
  startup). The package's Compose fragment passes it to the container. Safe only under all three: if
  a visitor can reach this server directly, or the proxy passes a client-sent header through
  unchanged, they choose the address the API rate-limits.
- **Refresh rotation.** The API rotates the refresh token on every refresh. If the new token never
  reaches the browser (an aborted navigation, a dropped response) and the old one is replayed after
  the API's 30 s grace window, the API reads it as reuse and revokes all of the account's sessions:
  the person is signed out everywhere. That is the server's reuse-detection policy, and the cost of
  rotation. `proxy.ts` keeps the window short by refreshing at the start of a request, before any
  slow work; do not move the refresh later in the request.
- **Cache.** `'use cache'` stores results in memory, per server instance. With more than one
  replica each has its own cache, and `updateTag` expires only the instance that ran the action, so
  another replica serves its copy until the `cacheLife` ends. Keep lifetimes short for data that must
  change quickly, or configure a shared cache handler before scaling out.

<!-- @server:auth-start -->

- **Cookies.** The session cookies are `Secure` when `NODE_ENV` is `production` (the image sets
  it). Browsers accept them on `http://localhost`, not on any other plain-HTTP host: terminate TLS
  in front of the container.

<!-- @server:auth-end -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
