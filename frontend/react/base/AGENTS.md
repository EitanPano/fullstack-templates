The layer map of this package. Commands are in `package.json`; the contract code in `src/services/generated/` is generated, never edited.

**`src/`**

- `main.tsx`: the entry. Imports `shared/utils/zod-messages` first (zod is configured before any
  schema is built), then the font, `styles/themes/brand.css` and `styles/styles.scss`; creates the
  one store, dispatches `themeRestored`, builds the router from `createRoutes(store)` and renders
  it inside `AppProviders`. Nothing else.
- `app/`: the wiring, no product logic, no fetch. `providers.tsx` (`AppProviders`: Redux
  `Provider`, tooltips, toaster), `routes.tsx` (`createRoutes(store)`: route objects, loaders and
  groups; the root route has no loader), `nav.ts` (`NAV`, the one navigation table),
  `root-error.tsx` (`RootError`, the last-resort boundary, a whole page).
- `core/`: glue below `app/`, above the features; `shared/` never imports it. `config/`: `env.ts`
  (the only reader of `import.meta`, zod-parsed, `VITE_*` is public), `api-client.ts` (the
  generated client's runtime config, with auth the 401 refresh), `constants.ts` (`STORAGE_KEYS`,
  with auth `SIGN_IN_PATH`, `FORBIDDEN_PATH`). `theme/theme.ts`: `toTheme`, `readStoredTheme`,
  `resolveTheme`, `applyTheme` (writes `data-theme` and the stored choice), `watchSystemTheme`.

<!-- @server:auth-start -->

`auth/`: `session-hint.ts` (the `localStorage` flag), `guards.ts` (`readSession`,
`requireAccount`, `requireRole`, `redirectIfSignedIn`, `returnToOf`, over the store).

<!-- @server:auth-end -->

- `layout/`: the shells. `main-layout/` (`MainLayout` takes the nav table as a prop, because
  `layout/` never imports `app/`; `main-loading.tsx` is the group's `HydrateFallback`,
  `main-error.tsx` its `ErrorBoundary`). `components/`: `header`, `nav-links`, `mobile-nav` (the
  phone sheet), `footer`, `user-menu`, `theme-menu`, `account-slot` (`AccountSlot`: the account
  menu with the server's auth, the theme menu alone without).

<!-- @server:auth-start -->

`components/account-menu.tsx` and `auth-layout/` (a centred `<main id="main">`, no shell;
loading and error files).

<!-- @server:auth-end -->

- `features/<module>/`: one directory per server module or screen group, named for the glossary
  noun: `<module>.routes.tsx` (`<module>Routes(store)`), `pages/`, `components/`, and when needed
  `<module>.form.ts`, `<module>.copy.ts`. A feature never imports another. `health/` is the worked
  example; `not-found/` is the `*` route, last in the main group, so a 404 keeps the shell.

<!-- @server:auth-start -->

`auth/` (sign-in, sign-up; `auth.form.ts`, `auth.copy.ts`), `user/` (profile, loader
`requireAccount`: the guarded-page example), `forbidden/` (where `requireRole` sends a wrong role).

<!-- @server:auth-end -->

- `store/`: `index.ts` (`createStore(preloaded?)`, `AppStore`, `RootState`), `hooks.ts`
  (`useAppDispatch`, `useAppSelector`), `theme.slice.ts` (`themeChanged`, `themeRestored`,
  `selectTheme`), `listeners.ts` (`createListeners`).
- `services/`: the data layer, the only importer of the generated runtime. `api.ts` (the one
  `createApi`, its `tagTypes`), `call.ts` (`call`, `DEFAULT_COPY`), `health.api.ts`,
  `generated/` (Hey API output; committed, lint-ignored).

<!-- @server:auth-start -->

`auth.api.ts` (`login`, `register`, `logout`), `user.api.ts` (`getMe`, tag `User`).

<!-- @server:auth-end -->

- `shared/`: product-agnostic; imports `shared/` and `models/` only. `components/`: one file per
  component, Radix rendered with the tree's classes: primitives (`button`, `badge`, `card`,
  `avatar`, `alert`, `separator`, `skeleton`, `spinner`, `input`, `textarea`, `label`, `checkbox`,
  `radio-group`, `switch`, `select`, `dialog`, `sheet`, `dropdown-menu`, `tooltip`, `tabs`,
  `toaster`) and patterns (`page`, `empty-state`, `error-state`, `skeletons`, `form-actions`,
  `confirm-dialog`). `components/form/`: `form`, `field-frame`, `use-field`, the `*-field` bindings
  (`text`, `textarea`, `number`, `select`, `checkbox`, `password`, `date-time`), `report-failure`.
  `utils/`: `cn`, `date`, `storage` (`localStorage` that never throws), `zod-messages`.

<!-- @server:auth-start -->

`components/auth-card.tsx`, `utils/next-path.ts` (`safeNextPath`).

<!-- @server:auth-end -->

- `models/`: one file per glossary noun: the contract's types re-exported, UI-only shapes, pure
  helpers. `api-error.ts` (`ApiError`, `isApiError`, `withCopy`), `health.ts`, `nav.ts`.

<!-- @server:auth-start -->

`user.ts` (`User`, `Role`, `isUser`, `initials`).

<!-- @server:auth-end -->

- `testing/`: imported only by `*.test.ts(x)`: `render-routes.tsx`, `stub-api.ts`.

<!-- @server:auth-start -->

`render-in-router.tsx`, `auth-fixtures.ts` (`USER`, `SESSION`, `envelope`).

<!-- @server:auth-end -->

- `styles/`: the only home of CSS (see Styling); `styles.scss` is the entry.

**Where does X go**

| Addition                                      | Home                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| A contract type, or a noun's pure helper      | `models/<noun>.ts`                                                     |
| A read or a mutation                          | `services/<module>.api.ts` (`api.injectEndpoints`)                     |
| A page, its components, its form schema, copy | `features/<module>/`                                                   |
| State shared across features (client-only)    | `store/<name>.slice.ts`; its side effect in `store/listeners.ts`       |
| A route                                       | `features/<module>/<module>.routes.tsx`, composed in `app/routes.tsx`  |
| A primitive (button, input, dialog)           | `shared/components/<name>.tsx` + `styles/components/_<name>.scss`      |
| A pattern (`Page`, `EmptyState`, …)           | `shared/components/`                                                   |
| A form field binding                          | `shared/components/form/`                                              |
| A formatting or date helper                   | `shared/utils/`                                                        |
| A route guard (with the server's auth)        | `core/auth/guards.ts`                                                  |
| An environment variable                       | `core/config/env.ts` plus `.env.example`                               |
| A navigation entry                            | `app/nav.ts`                                                           |
| A view's styles                               | `styles/views/_<view>.scss`, forwarded from `styles/views/_index.scss` |

**Import rules** (`eslint-plugin-boundaries`; each lint message names the layer to use instead). A
feature never imports another feature; `shared/` never imports `core/`, `store/` or `services/`.

| From                                                     | May import                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `app/`                                                   | layout, features (`*.routes.tsx` only), core, store, shared, models           |
| `main.tsx` (the `entry` category)                        | app, store, core, shared, models                                              |
| `layout/`                                                | core, store, services (the hooks), shared, models                             |
| `features/<f>/`                                          | core, store, services (the hooks), shared, models; its own feature            |
| `features/<f>/*.form.ts`                                 | shared, models, the generated zod schemas (`@/services/generated/zod.gen`)    |
| `store/`                                                 | services (reducer, middleware, matchers), `core/theme`, `core/config`, models |
| `services/`                                              | `services/generated`, `core/config`, `core/auth`, models                      |
| `core/auth/guards.ts` (the `guards` files category)      | store, services, `core/config`, `core/auth`, models (the wiring)              |
| `core/config`, `core/auth/session-hint.ts`, `core/theme` | shared, models, and each other (the leaves)                                   |
| `shared/`                                                | shared, models                                                                |
| `models/`                                                | models; the generated types and zod schemas, `import type` only               |
| `testing/`                                               | anything; nothing outside `*.test.ts(x)` imports it (tests are lint-ignored)  |

Also lint-enforced:

- The generated runtime is imported only in `services/`; its types only by `services/`, `store/`,
  `core/` and `models/` (everything else reads them through `models/<noun>.ts`).
- `fetch(`, `globalThis.fetch(`, `window.fetch(` only in `core/config/api-client.ts`;
  `import.meta` only in `core/config/env.ts`.
- `button`, `input`, `select`, `textarea` JSX elements only in `shared/components/`; the `style`
  JSX attribute nowhere; a `.css` or `.scss` import nowhere but `main.tsx`.
- `eslint-import-resolver-typescript` reads the `@/*` alias from `tsconfig.app.json`; keep it, the
  boundary rule is silent on an import it cannot resolve.

`tests/unit/eslint-boundaries.test.ts` lints one violation and one allowed case per rule, in a
throwaway project built from the real `eslint.config.mjs`. A new rule gets a case there. Use the
`@/` alias for every import that crosses a directory; relative imports stay inside one feature.
The API is always reached at relative `/api` on the page's own origin (see Deployment), so the
client takes its base from `window.location.origin` and the bundle carries no API URL.

## Adding a feature

The data flows one way: **component -> RTK Query hook (`services/<module>.api.ts`) -> `call` ->
generated SDK -> fetch client**. A component never calls `fetch` or the SDK; a one-off request
needs an endpoint first. `features/health`, `services/health.api.ts`, `models/health.ts` and
`styles/views/_home.scss` are the worked example. For a new server module (the noun, by its
`.doc/glossary.md` name):

1. **Glossary and contract.** Name the noun and the actions in `.doc/glossary.md`. If the contract
   changed, run `bun run api:types`: `src/services/generated/` is regenerated and committed.
2. **Model** `models/<noun>.ts`: re-export the contract's types, add UI-only shapes and helpers.
3. **Endpoints** `services/<noun>.api.ts`: `api.injectEndpoints`, a `build.query` per read with
   `providesTags`, a `build.mutation` per write with `invalidatesTags`, the exported hooks. Add
   the tag to `tagTypes` in `services/api.ts`.

   ```ts
   getHealth: build.query<HealthView, void>({
     queryFn: () => call(getApiHealth()),
     providesTags: ['Health'],
   }),
   ```

4. **Routes** `features/<noun>/<noun>.routes.tsx`: `<noun>Routes(store)` with a prefetching loader
   and a `lazy` page; compose it in `app/routes.tsx` inside the main group, before the catch-all.
   A gated page uses `requireAccount(store, returnToOf(request))` or `requireRole` as its loader.

   ```tsx
   loader: async () => {
     const subscription = store.dispatch(healthApi.endpoints.getHealth.initiate())
     try {
       return await subscription.unwrap()
     } finally {
       subscription.unsubscribe()
     }
   },
   lazy: () => import('./pages/home-page'),
   ```

   The entry stays cached after `unsubscribe`, so the page's hook finds it: one request. A
   rejected `unwrap()` reaches the group's `ErrorBoundary`.

5. **Page** `features/<noun>/pages/<page>-page.tsx`: exports the page as `Component` (the `lazy`
   contract): a `Page` with a `<title>`, a `PageHeader` and the feature's components.
6. **Components** `features/<noun>/components/*`: read the hook; a skeleton with the same layout
   while `isLoading`, `ErrorState` on `isError` with `refetch` as `onRetry`, the data otherwise.
   `<noun>.form.ts` (the zod schema) and `<noun>.copy.ts` (the copy tables) when needed.
7. **Styles** `styles/views/_<noun>.scss`, forwarded from `styles/views/_index.scss`; BEM classes.
8. **Navigation.** A top-level screen adds `{ to, label }` to `NAV` in `app/nav.ts`.
9. **State.** A client-only value two or more features read goes in a slice (see State).
10. **Configuration** only through `core/config/env.ts`: a browser-visible value is `VITE_*`,
    declared in its zod schema and listed in `.env.example`. Never a secret.
11. **No scaffolder.** Never run a generator inside this package. A new primitive is a file in
    `shared/components/` and a partial in `styles/components/` forwarded from its `_index.scss`.

### Reads

- `api` sets `refetchOnMountOrArgChange: 30` (seconds): a hook does not refetch data younger than
  30 s; `keepUnusedDataFor` stays 60 s. A query without an argument is `build.query<Data, void>`
  (`src/services/**` switches off `no-invalid-void-type` for it).
- A hook returns `{ data, error, isLoading, isError, isFetching, refetch }`; `error` is the
  `ApiError` (see Errors). A mutation's `invalidatesTags` refetches every subscribed component.

### Mutations

- The `queryFn` is `call(post…({ body }))`. The component awaits `trigger(arg).unwrap()` and shows
  the outcome **after the await**: a toast, or `reportFailure(form, error)` for a form. Never a
  toast from an effect, a listener or `onQueryStarted`.

  ```tsx
  try {
    await trigger().unwrap()
    toast.success(REFRESH_COPY.success)
  } catch (error) {
    toast.error(isApiError(error) ? error.message : 'Something went wrong.')
  }
  ```

- The endpoint returns the default copy; the feature words the failure with
  `withCopy(error, SIGN_IN_COPY, { conflict: 'email' })` (its table, a code put on one field). The
  server's text never reaches the page. `call(request, copy?, options?)` takes `options.fields`
  and `options.discriminator` (a second key from the envelope, `conflict:slot_taken`); a 400 with
  details becomes `fieldErrors` (copy key `validation_failed:<path>`).
- A cache write or stored flag that must follow a success happens inside the `queryFn`, before it
  returns, so every `unwrap()` caller sees it (`login`, `register`); `onQueryStarted` runs after the
  caller. Never `api.util.resetApiState()` inside a running mutation: it aborts it; reset after
  the await.

### Forms

React Hook Form with `zodResolver` and the mutation hook; `SignInForm` is the pattern.

- The schema is in `<noun>.form.ts` and extends the generated request schema
  (`zPostApiAuthLoginBody.extend({ … })`); limits are never copied. A field whose message is ours
  sets it itself, whatever the generated schema carries (the servers' schemas differ).
- `useForm({ resolver: zodResolver(schema), defaultValues })`: **every field needs a default
  value**, because a form's fields are the keys of its values (`reportFailure` reads them).
- `<Form form={form} onSubmit={onSubmit}>` provides the context; the field bindings take a `name`
  and a `label` and show the error with `aria-invalid` and `aria-describedby`; the submit row is
  `FormActions`.
- `reportFailure(form, error)` puts `fieldErrors` on their fields (the first takes focus) and
  toasts anything else, so a toast never repeats a field error. Mixed paths: the known ones land on
  fields, the others share one toast; none known: it toasts the message.

### State

- `createStore(preloaded?)` is `configureStore` over `api.reducer`, the slices, the listener
  middleware and `api.middleware`. `main.tsx` creates the one store; `renderRoutes` a fresh one per
  test, so no module holds a singleton. `setupListeners` is off unless a plan turns it on.
- A slice is `store/<name>.slice.ts` (`createSlice` with `selectors`) for **client-only** state two
  or more features or the layout read (`theme.slice.ts`); read with `useAppSelector`, write with
  `useAppDispatch`. Server state is the RTK Query cache, never copied into a slice. A side effect
  of a slice action is a listener in `store/listeners.ts`, not a reducer. State stays serializable:
  plain objects, no `Date`, no class instances.

### Dates

`shared/utils/date.ts` (`date-fns` v4 with `@date-fns/tz`) converts between an instant and a wall
time in a named zone; nothing reads the machine's zone. `wallTimeToInstant` refuses a time inside a
daylight-saving gap and takes the earlier instant for an ambiguous one; `dayKey` names the day in
the zone; `formatDate` and `formatDateTime` format in it. A form holds an instant (ISO with `Z`);
`DateTimeField` takes the zone as a prop.

<!-- @server:auth-start -->

### Auth

The API sets its tokens as HttpOnly cookies on the page's own origin (same-origin `/api`). The page
never reads a token: no JavaScript can.

- **Refresh.** `core/config/api-client.ts` wraps `fetch`: a 401 from the page's own origin, on any
  endpoint except sign-in, sign-up, the OTP calls and the refresh itself, becomes one
  `POST /api/auth/refresh` and one retry. Concurrent 401s share the one refresh (the API rotates
  the refresh token, so a second would be a replay). When the refresh fails the original 401 is
  returned and the guards send the visitor to sign-in.
- **The session hint.** The refresh only runs for a browser that signed in. The cookies are
  unreadable, so `core/auth/session-hint.ts` keeps a `localStorage` flag; without it every
  visitor's session probe would spend one of the API's per-address refresh attempts.
  - It never holds a token or user data (the value is `1`), is set only after a sign-in or sign-up
    succeeded and is cleared on sign-out.
  - A missing hint with valid cookies (storage cleared or blocked) shows the signed-out view until
    the user signs in; nothing is lost and nothing is exposed.
  - A stale hint costs one refresh: a 400, 401 or 403 from `POST /api/auth/refresh` clears it (the
    servers answer 400 `refresh token missing` once the browser dropped the expired cookie). A 429,
    a 5xx or a network error does not, because they say nothing about the cookie.
- **The session is the `getMe` cache entry.** There is no auth slice (a second source of truth).
  `getMe` resolves a visitor's 401 to `null`; any other failure stays an `ApiError`. The root route
  has no loader: the shell renders at once and the header's `useGetMeQuery` is the session read.
  RTK Query deduplicates it with a guard's `initiate()` for the same key, so a visitor costs one
  `/api/user/me`.
- **Guards.** `core/auth/guards.ts`: `readSession(store)` returns the `User` or `null`, failing
  closed (logged, except the 401); `requireAccount(store, returnTo?)` throws a redirect to
  `/sign-in?next=…`; `requireRole(store, 'admin', returnTo?)` does the same for a visitor and sends
  another role to `/forbidden`; `redirectIfSignedIn(store)` sends an account home. A loader calls
  them: `loader: ({ request }) => requireAccount(store, returnToOf(request))`. The role is the
  API's answer, never a claim in a token; a guard only keeps a visitor off a screen, the API checks
  every call. A guarded page's `noindex` tag is client-rendered; the loader's guard is the
  protection.
- **Sign-in and sign-up.** `login` and `register` resolve to the user only (the tokens never enter
  the store). Inside their `queryFn`, before returning, they set the hint and write the account
  into the `getMe` cache, so the header flips without a request and the next loader finds the
  account. The form navigates to `safeNextPath(next)` after the await: a path on this site, else
  `/` (it compares the decoded, lowercased path with the auth screens).
- **Sign-out.** `logout`'s `queryFn` calls the API, logs a failure and clears the hint whatever the
  API said. `SignOutItem` then dispatches `api.util.resetApiState()` after `await logout().unwrap()`
  and before `navigate('/sign-in')`.
- **The account slot** is `AccountSlot`. `AccountMenu` has three states: a skeleton while `getMe`
  loads, a "Sign in" link and the theme menu for a visitor, the avatar menu (email, theme, "Sign
  out") for an account. The email is in the menu, never header text.
- **Staff pages.** Put them under a pathless route whose loader calls
  `requireRole(store, 'admin', returnToOf(request))`, and give every staff loader the same call.
  The template ships no staff page: no route creates an admin yet.
- **Renaming the roles.** The roles are `user` and `admin`. A product that renames them changes
  `isUser` in `models/user.ts` (another role reads as signed out), every `requireRole(...)` call,
  the role-gated group, the unit tests that use a role, and this file, after the server's roles
  and the `contract` command. A role-gated route also needs a setup in the e2e screens list.

<!-- @server:auth-end -->

## Styling

- `src/styles/` is the only home of CSS. `main.tsx` imports Inter, `themes/brand.css`, then
  `styles.scss`; no other file imports a stylesheet and no component sets a `style` attribute
  (`tests/unit/styles-tree.test.ts`). `styles.scss` `@use`s `setup/` (`variables`, `breakpoints`,
  `functions`, `mixins`, `typography`), `themes`, `basics/` (`helpers`, `base`, `layout`),
  `components`, `views`, in that order. A component renders BEM classes (`.button--primary`,
  `.header__brand`) composed with `cn` from `@/shared/utils/cn`.
- **Tokens.** The generator writes the brand's light and dark colour blocks, `--radius` and
  `color-scheme` into `themes/brand.css` under `:root` and `[data-theme='dark']`: plain CSS, since
  its placeholders are not valid Sass (`.prettierignore` lists it; it builds only after
  generation). `themes/_light.scss` and `_dark.scss` hold the product's tokens beyond that set
  (surfaces, `--border-strong`, `--focus-ring`, skeleton, `--backdrop`, shadows), the same keys in
  both; `setup/_typography.scss` takes the brand's font stack. Never a literal colour or size.
  Spacing is the 4 px scale through `space()` (`space(4)` is 16 px); breakpoints `sm` 576, `md` 768,
  `lg` 1024, `xl` 1280, `xxl` 1536 through `breakpoints.up()`; mobile first; logical properties.
- **Theming.** `data-theme` on `<html>` holds the resolved value (`light` or `dark`, never
  `system`). `public/theme-init.js` sets it before first paint from the stored choice or the
  brand's default; it is a file, not an inline script (`script-src 'self'`). `core/theme/theme.ts`
  and the theme slice's listener keep it in step and follow the OS while the choice is `system`.
  Keep script and `theme.ts` in step (storage key `theme`, same default). No `prefers-color-scheme`
  block.
- **Sizing.** A control is 36 px on a fine pointer, 32 px under `[data-density='compact']` on a
  fine pointer, 44 px on `(pointer: coarse)` whatever the density; icon buttons the same square.
  Use the `setup/_mixins.scss` mixins in this order: `control-height`, `compact-density`, then
  `touch-target` last, so the size never undoes it. `tests/unit/density.test.ts` compiles the tree
  and asserts the three numbers. No page scrolls horizontally at any width.
- **Primitives** are Radix (`radix-ui`), rendered by `shared/components/` with the tree's classes;
  Radix's data attributes (`data-state`, `data-side`) are the styling hooks. One icon set
  (`lucide-react`, `aria-hidden` next to a label) and one toast implementation (`sonner`, themed
  from the theme slice by `AppProviders`). No scaffolder.
- **Patterns** in `shared/components/`: `Page`, `PageHeader`, `Section`, `EmptyState`,
  `ErrorState` (with retry), `ListSkeleton`, `CardSkeleton`, `FormActions` (sticky on phones),
  `ConfirmDialog`; `AuthCard` with the server's auth. `UserMenu` and the shell (skip link, header
  with the nav inline from `md` and in a sheet on phones, account slot, one `main`, footer) are in
  `layout/`. Use a pattern before writing a layout by hand. A page renders inside the shell and
  never adds a landmark set; it sets its title with a `<title>` element.
- **Forms** use `shared/components/form/`, never a raw `input`. **Status** is a `Badge` by meaning
  (`success`, `warning`, `destructive`, `muted`, `info`) with words or an icon, never colour alone.
  Semantic HTML, labelled controls, keyboard-reachable interactions; the target is WCAG 2.2 AA,
  checked by the axe scan.

## Errors

- Every route has a loading and an error state, its own or its group's: `main-loading.tsx` and
  `main-error.tsx` for the main group, the auth-layout pair for the auth screens,
  `app/root-error.tsx` for what no group caught. A group is a pathless route inside the group's
  layout, so its boundary renders inside the shell. Every data section has a skeleton that matches
  its layout. Messages are user-safe: no stack trace, query text, internal URL or secret. A
  boundary logs the cause with `console.error`; its Try again button calls `revalidate()`, which
  re-runs the loaders.
- The generated client does not throw on an HTTP error status: it returns
  `{ data, error, response }`, and on a network failure `response` is undefined and `error` is the
  thrown value. `call` (`src/services/call.ts`) is the only place that reads the result and returns
  `{ data }` or `{ error: ApiError }` (RTK Query's `queryFn` contract); it does not throw.
- `ApiError` (`models/api-error.ts`) is a plain object, never an `Error` subclass: RTK Query keeps a
  failed query's error in the Redux state, which refuses class instances. A hook's `error` and the
  rejection of `.unwrap()` are the same object; `isApiError` is the guard. A `queryFn` that throws
  loses the copy mapping: return the error.
- The message is copy we wrote: the feature's table by `code` (via `withCopy`, with a second key
  when the contract adds a discriminator), then the default below. The server's `message` is never
  shown. A 5xx, a missing envelope or an unreachable API is logged with its request id first.

  | `code` (status)                  | Default copy                                                 |
  | -------------------------------- | ------------------------------------------------------------ |
  | `validation_failed` (400)        | Check the form and try again. (per field with details)       |
  | `unauthenticated` (401)          | Your session has expired. Sign in again.                     |
  | `forbidden` (403)                | You don't have access to this.                               |
  | `not_found` (404)                | We couldn't find that.                                       |
  | `conflict` (409)                 | That conflicts with something that already exists.           |
  | `payload_too_large` (413)        | That is too large to send.                                   |
  | `unsupported_media_type` (415)   | That kind of file isn't supported.                           |
  | `rate_limited` (429)             | Too many attempts. Wait a few minutes and try again.         |
  | `internal` (500)                 | Something went wrong on our side. Try again.                 |
  | `upstream_unavailable` (502-504) | The service is unavailable right now. Try again in a moment. |
  | no response (`network`)          | Can't reach the server. Check your connection and try again. |

  A feature overrides the entries that need its own words (`SIGN_IN_COPY` maps 401 to "Email or
  password is wrong." because the API cannot tell the two apart by design).

- A handler shows `error.message` with `toast.error` (`RefreshHealthButton`) or calls
  `reportFailure`; a component that reads a hook shows `ErrorState` with the message and `refetch`.

## Tests

- Unit tests run with `bun run test` (Vitest, jsdom, React Testing Library): co-located
  `src/**/*.test.ts(x)`, `userEvent` for input. `tests/unit/` holds the tooling checks:
  `eslint-boundaries` (import rules), `styles-tree` (no stylesheet import or `style` outside
  `main.tsx`), `density` (compiled sizes), `main-imports` (zod configured first), `zod-config` (no
  `new Function` under the CSP), `screen-routes` (`capturedRoutes`), `playwright-config` (blank
  `E2E_BASE_URL`), and with a database `e2e-database-url`.
- The API is the one boundary: `stubApi` stubs the global `fetch` by `METHOD /path`, so a test goes
  through the real generated client, `call`, the copy tables and the cache. A route is tested with
  `renderRoutes` (a memory router over `createRoutes`, a fresh store); with auth, `renderInRouter`
  renders one component under the store and a router. Mock `sonner` to assert a toast. No test
  starts the server. Drive `revalidate()` through a button, not from the test body.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`). `playwright.config.ts`
  starts the API fresh (`reuseExistingServer: false`, `RATE_LIMIT_SCALE=100`) and the production
  build behind `vite preview`, which forwards `/api` to that API. Install the browser once with
  `bun x playwright install chromium` (add `--with-deps` on Linux).

<!-- @server:database-start -->

- **E2E database.** The server's `e2eDb` command is chained before its start command, on
  `app_e2e`, because Playwright starts web servers before `globalSetup`; the development database
  is never touched. `E2E_DATABASE_URL` overrides the URL, a blank value takes the default, and a
  name that does not end in `_e2e` is refused when the config loads (`scripts/e2e-database-url.ts`,
  unit tested). Container mode starts no API and skips the check.

<!-- @server:database-end -->

- **Container mode.** With `E2E_BASE_URL` set (a blank value counts as unset), `bun run test:e2e`
  tests that URL and starts nothing. The API there runs at rate-limit scale 1 with one per-address
  bucket, so the suite can run about once per 15 minutes per stack, and it leaves its accounts in
  that stack's `app` database. The catalog's case runner brings a stack up and down with its
  volumes, so it is unaffected.
- **Projects.** `phone` (`devices['Pixel 7']`, touch) runs every journey with its axe scan;
  `desktop` (`devices['Desktop Chrome']`) runs `shell.spec.ts` and `screens.spec.ts`. A check for
  one is tagged `{ tag: '@phone' }` or `{ tag: '@desktop' }` and the other project's `grepInvert`
  leaves it out, so nothing skips at run time. `retries: 0`, a trace is kept on failure: a test
  that passes only on a retry is a failure.
- **Specs.** `shell.spec.ts`: landmarks, skip link, no overflow, 44 px targets (phone), 36 and 32 px
  densities (desktop), the theme switch through `data-theme`; a `--density compact` build must pass
  its phone tests. `smoke.spec.ts` reaches the API through the page. `auth.spec.ts` (with auth):
  sign-up, sign-out, sign-in, a wrong password, a taken email on its field, the guarded redirect.
  `screens.spec.ts` captures every `NAV` route (with auth also sign-in and sign-up) in phone and
  desktop, light and dark, to `test-results/screens/<route>-<viewport>-<theme>.png` (QA reads them),
  and checks each: no axe violation of WCAG A and AA (in dark this is the contrast measurement), no
  horizontal scroll, one `h1`; a failure names the route, theme and project (`screenProblems` in
  `support.ts`). `tests/e2e/screen-routes.ts` holds `AUTH_ROUTES`, `SIGNED_IN_ROUTES`,
  `capturedRoutes`.

<!-- @server:auth-start -->

- `SIGNED_IN_ROUTES` (`/profile`, `/forbidden`) are captured after signing up through the form;
  entries without a `setup` share one account per project. A role-gated route is an entry with a
  `setup(account)`, which the project writes in its own e2e support file (for example promoting
  `account.email` to the role); the entry gets its own account. A setup writes only to
  `account.databaseUrl`, the browser-test database (refused unless its name ends in `_e2e`) and
  never reads a connection string from the environment (`DATABASE_URL` is the development one).
  With `E2E_BASE_URL` set the entries with a `setup` are left out, so a setup never reaches a
  development or production database. After a `setup` the spec signs out and in again through the
  form, because the role is a claim in the session's token. Each signed-in test sets its own
  timeout from its number of captures; no `storageState` setup project. A project without a
  database has nothing to promote (its setup receives no `databaseUrl`).

<!-- @server:auth-end -->

- The data rule: a journey creates its data through the API or the UI with a name unique per run,
  and never takes the database's contents as a precondition.
- Every new behaviour gets a test for the happy path and at least one for a failure or empty path.
  No `.skip`, `.only`, `test.fixme` or `describe.skip`; a removed test is named in the stage
  report.

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
- Browser-visible configuration is `VITE_*`, read in `src/core/config/env.ts` at build time. Never put a
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
