The layer map of this package. Commands are in `package.json`; the contract code in `src/services/generated/` is generated, never edited. <!-- @server -->
The layer map of this package. Commands are in `package.json`. <!-- @noserver -->

**`src/`**

- `main.tsx`: the entry. Imports `shared/utils/zod-messages` first (zod is configured before any
  schema is built), then the font, `styles/themes/brand.css` and `styles/styles.scss`; creates the
  one store, dispatches `themeRestored`, builds the router from `createRoutes(store)` and renders
  it inside `AppProviders`. Nothing else.
- `app/`: the wiring, no product logic, no fetch. `providers.tsx` (`AppProviders`: Redux
  `Provider`, tooltips, toaster), `routes.tsx` (`createRoutes(store)`: route objects, loaders and
  groups; the root route has no loader), `nav.ts` (`NAV`, the one navigation table),
  `root-error.tsx` (`RootError`, the last-resort boundary, a whole page).
- `core/`: glue below `app/`, above the pages; `shared/` never imports it. `config/`: `env.ts`
  (the only reader of `import.meta`, zod-parsed, `VITE_*` is public), `api-client.ts` (the <!-- @server -->
  generated client's runtime config, with auth the 401 refresh), `constants.ts` (`STORAGE_KEYS`, <!-- @server -->
  (the only reader of `import.meta`, zod-parsed, `VITE_*` is public), `constants.ts` (`STORAGE_KEYS`, <!-- @noserver -->
  with auth `SIGN_IN_PATH`, `FORBIDDEN_PATH`). `theme/theme.ts`: `toTheme`, `readStoredTheme`,
  `resolveTheme`, `applyTheme` (writes `data-theme` and the stored choice), `watchSystemTheme`.

<!-- @server:auth-start -->

`auth/`: `session-hint.ts` (the `localStorage` flag), `guards.ts` (`readSession`,
`requireAccount`, `requireRole`, `redirectIfSignedIn`, `returnToOf`, over the store).

<!-- @server:auth-end -->

- `components/`: the app-wide components, every file `app-*` with its `.scss` beside it when
  styled. The layout and its group screens: `app-main-layout` (`AppMainLayout`: the skip link and
  the one `main`), `app-main-loading` (the group's `HydrateFallback`), `app-main-error` (its
  `ErrorBoundary`). Components the product places in its own shell, rendered by no template file:
  `app-user-menu` (the avatar menu, which carries the theme items) is the control a product
  places; `app-theme-menu` is those items, for a menu the product writes. A component goes
  here when a layout or the product's shell composes it or it reads the store, the theme or the
  session; a reusable control or pattern goes to `shared/components/`.

<!-- @server:auth-start -->

`app-account-menu` (a component the product places) and `app-auth-layout` (a centred
`<main id="main">`, no skip link) with `app-auth-loading` and `app-auth-error`.

<!-- @server:auth-end -->

- `pages/<module>/`: one directory per server module or screen group, named for the glossary
  noun, flat: `<module>.routes.tsx` (`<module>Routes(store)`), the routed `<name>-page.tsx` files
  beside it each with its `<name>-page.scss`, when needed `<module>.form.ts` and
  `<module>.copy.ts`; `components/` is the one sub-directory, for the module's own pieces. A page
  never imports another module. `home/` is the index route (one `h1`, no data call); `not-found/`
  is the `*` route, last in the main group, so a 404 keeps the layout.

<!-- @server:auth-start -->

`auth/` (sign-in, sign-up; `auth.form.ts`, `auth.copy.ts`), `user/` (profile with its Sign out
button, loader `requireAccount`: the guarded-page example), `forbidden/` (where `requireRole` sends
a wrong role).

<!-- @server:auth-end -->

- `store/`: `index.ts` (`createStore(preloaded?)`, `AppStore`, `RootState`), `hooks.ts`
  (`useAppDispatch`, `useAppSelector`), `theme.slice.ts` (`themeChanged`, `themeRestored`,
  `selectTheme`), `listeners.ts` (`createListeners`).

<!-- @server:auth-start -->

`use-sign-out.ts` (`useSignOut`: the one sign-out action).

<!-- @server:auth-end -->

- `services/`: the data layer, the only importer of the generated runtime. `api.ts` (the one <!-- @server -->
  `createApi`, its `tagTypes`), `call.ts` (`call`, `DEFAULT_COPY`), `refetchIfRejected` in `api.ts`, <!-- @server -->
  `generated/` (Hey API output; committed, never edited). <!-- @server -->
- `services/`: the data layer. Empty until a server arrives (see Adding a feature). <!-- @noserver -->

<!-- @server:auth-start -->

`auth.api.ts` (`login`, `register`, `logout`), `user.api.ts` (`getMe`, tag `User`).

<!-- @server:auth-end -->

- `shared/`: product-agnostic; imports `shared/` and `models/` only. `components/`: one file per
  component with its `.scss` beside it, Radix rendered with the tree's classes: primitives (`button`, `badge`, `card`,
  `avatar`, `alert`, `separator`, `skeleton`, `spinner`, `input`, `textarea`, `label`, `checkbox`,
  `radio-group`, `switch`, `select`, `dialog`, `sheet`, `dropdown-menu`, `tooltip`, `tabs`,
  `toaster`) and patterns (`page`, `empty-state`, `error-state`, `skeletons`, `form-actions`,
  `confirm-dialog`). `components/form/`: `form`, `field-frame`, `use-field`, the `*-field` bindings
  (`text`, `textarea`, `number`, `select`, `checkbox`, `password`, `date-time`), `report-failure`. <!-- @server -->
  (`text`, `textarea`, `number`, `select`, `checkbox`, `password`, `date-time`). <!-- @noserver -->
  `hooks/`: `useMediaQuery`, `useOnlineStatus` (both on `useSyncExternalStore`) and
  `useDebouncedValue`; no template file calls them, they are for the product's shell and its first
  search box. Hooks
  over the store stay in `store/hooks.ts`; `src/hooks/` is an unknown file.
  `utils/`: `cn`, `date`, `storage` (`localStorage` that never throws), `zod-messages`.

<!-- @server:auth-start -->

`components/auth-card.tsx`, `utils/next-path.ts` (`safeNextPath`).

<!-- @server:auth-end -->

- `models/`: one file per glossary noun: the contract's types re-exported, UI-only shapes, pure <!-- @server -->
  helpers. `api-error.ts` (`ApiError`, `isApiError`, `withCopy`), `nav.ts`. <!-- @server -->
- `models/`: one file per glossary noun: UI-only shapes, pure helpers. `nav.ts`. <!-- @noserver -->

<!-- @server:auth-start -->

`user.ts` (`User`, `Role`, `isUser`, `initials`).

<!-- @server:auth-end -->

- `testing/`: imported only by `*.test.ts(x)`: `render-routes.tsx`, `stub-api.ts`.

<!-- @server:auth-start -->

`render-in-router.tsx`, `auth-fixtures.ts` (`USER`, `SESSION`, `envelope`).

<!-- @server:auth-end -->

- `styles/`: global and app-wide CSS only: `styles.scss`, `setup/`, `themes/`, `basics/` (see Styling).

**Where does X go**

| Addition                                      | Home                                                               |
| --------------------------------------------- | ------------------------------------------------------------------ |
| A contract type, or a noun's pure helper      | `models/<noun>.ts`                                                 | <!-- @server -->
| A read or a mutation                          | `services/<module>.api.ts` (`api.injectEndpoints`)                 | <!-- @server -->
| A page, its components, its form schema, copy | `pages/<module>/`                                                  |
| State shared across pages (client-only)       | `store/<name>.slice.ts`; its side effect in `store/listeners.ts`   |
| A route                                       | `pages/<module>/<module>.routes.tsx`, composed in `app/routes.tsx` |
| A primitive (button, input, dialog)           | `shared/components/<name>.tsx` + `<name>.scss` beside it           |
| An app-wide component (a menu, the header)    | `components/app-<name>.tsx` + `app-<name>.scss` beside it          |
| A pattern (`Page`, `EmptyState`, …)           | `shared/components/`                                               |
| A form field binding                          | `shared/components/form/`                                          |
| A formatting or date helper                   | `shared/utils/`                                                    |
| A product-agnostic hook                       | `shared/hooks/use-<name>.ts` + its test                            |
| A hook a page and an app-wide component share | `store/use-<name>.ts`: pages never import `components/`           |
| A route guard (with the server's auth)        | `core/auth/guards.ts`                                              |
| An environment variable                       | `core/config/env.ts` plus `.env.example`                           |
| A navigation entry                            | `app/nav.ts`                                                       |
| A stylesheet                                  | beside its component or page, imported last by it                  |

**Import rules** (`eslint-plugin-boundaries`; each lint message names the layer to use instead). A
page never imports another page; `shared/` never imports `core/`, `store/` or `services/`.

| From                                                     | May import                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `app/`                                                   | components, pages (`*.routes.tsx` only), core, store, shared, models               |
| `main.tsx` (the `entry` category)                        | app, store, core, shared, models                                                   |
| `components/`                                            | core, store, services (the hooks), shared, models; never `app/`, `pages/`          |
| `pages/<m>/`                                             | core, store, services (the hooks), shared, models; its own module                  |
| `pages/<m>/*.form.ts`                                    | shared, models, the generated zod schemas (`@/services/generated/zod.gen`)         | <!-- @server -->
| `store/`                                                 | services (reducer, middleware, matchers), `core/theme`, `core/config`, models      |
| `services/`                                              | `services/generated`, `core/config`, `core/auth` (not the guards), models          |
| `core/auth/guards.ts` (the `guards` files category)      | store, services, `core/config`, `core/auth`, models (the wiring)                   |
| `core/config`, `core/auth/session-hint.ts`, `core/theme` | shared, models, and each other (the leaves; never the guards or the runtime)       |
| `shared/` (with `shared/hooks/`)                         | shared, models                                                                     |
| `models/`                                                | models; the generated types and zod schemas, `import type` only                    |
| `testing/`                                               | anything; nothing outside `*.test.ts(x)` imports it (tests are boundaries-ignored) |

Also lint-enforced:

- The generated runtime is imported only in `services/`; its types only by `services/`, `store/`, <!-- @server -->
  `core/` and `models/` (everything else reads them through `models/<noun>.ts`). <!-- @server -->
- `fetch(`, `globalThis.fetch(`, `window.fetch(` only in `core/config/api-client.ts`; <!-- @server -->
  `import.meta` only in `core/config/env.ts`. <!-- @server -->
- `import.meta` only in `core/config/env.ts`. <!-- @noserver -->
- `button`, `input`, `select`, `textarea` JSX elements only in `shared/components/`; the `style`
  JSX attribute nowhere; a stylesheet import is only the owner's sibling `./<stem>.scss` (imported last); the global tree is loaded only by `main.tsx`.
- `boundaries/no-unknown-files` and `no-unknown-dependencies` are on: a file in a directory that
  matches no layer (`src/hooks/`, `src/lib/`, a stray file) is an error. `src/styles/**`,
  `vite-env.d.ts` and the tests are boundaries-ignored. `session-hint.ts` may not import the guards <!-- @server -->
  or the generated runtime (`no-restricted-imports`); only the two client tests <!-- @server -->
  (`api-client.test.ts`, `api-client-refresh.test.ts`) import the generated SDK. <!-- @server -->
  `vite-env.d.ts` and the tests are boundaries-ignored. <!-- @noserver -->
- Keep `eslint-import-resolver-typescript` (it reads the `@/*` alias): without it violations pass.

`tests/unit/eslint-boundaries.test.ts` lints one violation and one allowed case per rule, through
the real `eslint.config.mjs`. A new rule gets a case there. Use the `@/` alias for every import that
crosses a directory; relative imports stay inside one directory (a page and its sibling stylesheet). The API is always relative `/api` on <!-- @server -->
the page's own origin (see Deployment), so the bundle carries no API URL. <!-- @server -->
crosses a directory; relative imports stay inside one directory (a page and its sibling stylesheet). <!-- @noserver -->

## Adding a feature

<!-- @noserver-start -->

This package has no server yet, so it has no data layer. What arrives with one is added by the
harness (`scripts/scaffold.mjs`), never by a hand copy:

- The typed client: `openapi-ts.config.ts`, the `api:types` script, `@hey-api/openapi-ts` and
  `src/services/generated/`.
- The data layer: `services/api.ts` (the one RTK Query `createApi`), `services/call.ts`,
  `models/api-error.ts`, `core/config/api-client.ts`, `shared/components/form/report-failure.ts`, their
  tests, and `api.reducer` and `api.middleware` in `store/index.ts`.
- The `/api` proxy of `vite.config.ts`, the API web server of `playwright.config.ts`, the
  `GET /api/health` smoke test and the `/api/` proxy of `nginx/default.conf`.

A feature without a server is a route, a page with its components and, for client-only state, a
slice (see State).

<!-- @noserver-end -->
<!-- @server-start -->
The data flows one way: **component -> RTK Query hook (`services/<module>.api.ts`) -> `call` ->
generated SDK -> fetch client**. A component never calls `fetch` or the SDK; a one-off request
needs an endpoint first. For a new server module (the noun, by its `.doc/glossary.md` name; `post`
below). In the blocks, `Post`, `PostRow`, `PostList`, `getApiPost`, `patchApiPostById`, the `'Post'` tag
and the `postApi` hooks are the example feature's own names: they exist once the server has the
endpoint, `bun run api:types` has regenerated the client and `models/post.ts` exists. Everything
else in the blocks already exists in the template.

1. **Glossary and contract.** Name the noun and the actions in `.doc/glossary.md`. If the contract
   changed, run `bun run api:types`: `src/services/generated/` is regenerated and committed.
2. **Model** `models/<noun>.ts`: re-export the contract's types, add UI-only shapes and helpers.
3. **Endpoints** `services/<noun>.api.ts`: `api.injectEndpoints`, a `build.query` per read with
   `providesTags`, a `build.mutation` per write with `invalidatesTags`, the exported hooks. Add
   the tag to `tagTypes` in `services/api.ts`.

   A read and a mutation:

   ```ts
   // services/post.api.ts
   export const postApi = api.injectEndpoints({
     endpoints: (build) => ({
       listPosts: build.query<Post[], void>({
         queryFn: () => call(getApiPost()),
         forceRefetch: refetchIfRejected,
         providesTags: ['Post'],
       }),
       renamePost: build.mutation<Post, { id: string; title: string }>({
         queryFn: ({ id, title }) => call(patchApiPostById({ path: { id }, body: { title } })),
         invalidatesTags: ['Post'],
       }),
     }),
   })
   export const { useListPostsQuery, useRenamePostMutation } = postApi
   ```

4. **Routes** `pages/<noun>/<noun>.routes.tsx`: `<noun>Routes(store)` with a prefetching loader
   and a `lazy` page; compose it in `app/routes.tsx` inside the main group, before the catch-all.
   A gated page uses `requireAccount(store, returnToOf(request))` or `requireRole` as its loader.

   ```tsx
   // pages/post/post.routes.tsx
   export function postRoutes(store: AppStore): RouteObject[] {
     return [
       {
         path: 'post',
         loader: async () => {
           const subscription = store.dispatch(postApi.endpoints.listPosts.initiate())
           try {
             return await subscription.unwrap()
           } finally {
             subscription.unsubscribe()
           }
         },
         lazy: () => import('./post-page'),
       },
     ]
   }
   ```

   The entry stays cached after `unsubscribe`, so the page's hook finds it: one request. A
   rejected `unwrap()` reaches the group's `ErrorBoundary`.

5. **Page** `pages/<noun>/<page>-page.tsx`: exports the page as `Component` (the `lazy`
   contract): a `Page` with a `<title>`, a `PageHeader` and the module's components.

   ```tsx
   // pages/post/post-page.tsx
   function PostPage() {
     return (
       <Page>
         <title>Posts · __PROJECT_DISPLAY_NAME__</title>
         <PageHeader title="Posts" />
         <PostList />
       </Page>
     )
   }

   export { PostPage as Component }
   ```

6. **Components** `pages/<noun>/components/*`: read the hook; a skeleton with the same layout
   while `isLoading`, `ErrorState` on `isError` with `refetch` as `onRetry`, the data otherwise.
   `<noun>.form.ts` (the zod schema) and `<noun>.copy.ts` (the copy tables) when needed.

   ```tsx
   // pages/post/components/post-list.tsx
   export function PostList() {
     const { data, error, isLoading, isError, isFetching, refetch } = useListPostsQuery()
     if (isLoading) return <ListSkeleton />
     if (isError) {
       return (
         <ErrorState
           title="Posts"
           description={isApiError(error) ? error.message : 'Something went wrong. Try again.'}
           retrying={isFetching}
           onRetry={() => void refetch()}
         />
       )
     }
     return data?.map((post) => <PostRow key={post.id} post={post} />)
   }
   ```

<!-- @server-end -->
7. **Styles** a sibling `<page>-page.scss` with the page's stem, imported last by the page <!-- @server -->
1. **Styles** a sibling `<page>-page.scss` with the page's stem, imported last by the page <!-- @noserver -->
   (`import './<page>-page.scss'`); the same for a component. BEM classes.
8. **Navigation.** A top-level screen adds `{ to, label }` to `NAV` in `app/nav.ts`. <!-- @server -->
2. **Navigation.** A top-level screen adds `{ to, label }` to `NAV` in `app/nav.ts`. <!-- @noserver -->
9. **State.** A client-only value two or more pages read goes in a slice (see State). <!-- @server -->
3. **State.** A client-only value two or more pages read goes in a slice (see State). <!-- @noserver -->
10. **Configuration** only through `core/config/env.ts`: a browser-visible value is `VITE_*`, <!-- @server -->
4. **Configuration** only through `core/config/env.ts`: a browser-visible value is `VITE_*`, <!-- @noserver -->
    declared in its zod schema and listed in `.env.example`. Never a secret.
11. **No scaffolder.** Never run a generator inside this package. A new primitive is a file in <!-- @server -->
5. **No scaffolder.** Never run a generator inside this package. A new primitive is a file in <!-- @noserver -->
    `shared/components/` with its sibling `.scss`.

**The shell.** The template renders no header, navigation or footer: `AppMainLayout` is the skip
link and the page's one `main`. A product's chrome is a component in `components/` (this
template's home for app-wide components) that `AppMainLayout` renders between the skip link and
`main`. The nav table lives in `app/nav.ts` and `components/` never imports `app/`, so
`app/routes.tsx` passes it in: give `AppMainLayout` a prop, such as `nav`, for the chrome to read.
`AppUserMenu` is ready to place there (it carries the theme items); `AppThemeMenu` is a fragment
of menu items for a menu the product writes, and throws outside one.

<!-- @server:auth-start -->

With the server's auth, the account control is `AppAccountMenu`.

<!-- @server:auth-end -->

The features in use, so a new page does not reinvent them: `useId` for label and error ids,
React 19's `<title>` in a page, lazy route modules, error boundaries, RTK Query's generated hooks, <!-- @server -->
React 19's `<title>` in a page, lazy route modules, error boundaries, <!-- @noserver -->
and the three `shared/hooks/`. Not used, on purpose: `useTransition`, `useDeferredValue`,
`useOptimistic`, `memo`; the template has no case that needs them.

<!-- @server-start -->
### Reads

- `api` sets `refetchOnMountOrArgChange: 30` (seconds): a hook does not refetch data younger than
  30 s; `keepUnusedDataFor` stays 60 s. Every query sets `forceRefetch: refetchIfRejected`
  (from `services/api.ts`): an entry that succeeded and then rejected keeps its timestamp and
  would not be refetched within the 30 s. A query without an argument is `build.query<Data, void>`
  (`src/services/**` turns off `no-invalid-void-type`).
- A hook returns `{ data, error, isLoading, isError, isFetching, refetch }`; `error` is the
  `ApiError`. A mutation's `invalidatesTags` refetches every subscribed component.

### Mutations

- The `queryFn` is `call(post…({ body }))`. The component awaits `trigger(arg).unwrap()` (`rename`
  below, from `useRenamePostMutation()`) and shows the outcome **after the await**: a toast, or
  `reportFailure(form, error)` for a form. Never a toast from an effect, a listener or
  `onQueryStarted`.

  ```tsx
  try {
    await rename({ id, title }).unwrap()
    toast.success('Post renamed')
  } catch (error) {
    toast.error(isApiError(error) ? error.message : 'Something went wrong.')
  }
  ```

- `call(request)` takes only the request and returns the default copy; it maps a 400's `details`
  to `fieldErrors`, and `ApiError.details` carries the envelope's raw `details`. The page words
  the failure with `withCopy(error, TABLE, { fields?, discriminator? })`, its one wording step:
  `fields` puts a code on one field (`{ conflict: 'email' }`), `discriminator` reads a second key
  from `error.details`. The lookup is `TABLE['code:second']`, then `TABLE[code]`, then the error's
  message; `validation_failed:<path>` words one field. The server's text never reaches the page.
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
  toasts the rest, never repeating a field error: unknown paths share one toast; none known, the
  message.

<!-- @server-end -->
### State

- `createStore(preloaded?)` is `configureStore` over `api.reducer`, the slices, the listener <!-- @server -->
  middleware and `api.middleware`, with `devTools: env.MODE !== 'production'`: never leave DevTools <!-- @server -->
- `createStore(preloaded?)` is `configureStore` over the slices and the listener middleware, <!-- @noserver -->
  with `devTools: env.MODE !== 'production'`: never leave DevTools <!-- @noserver -->
  on in production, a mutation's action carries its arguments. `main.tsx` creates the one store; `renderRoutes` a fresh one per
  test, so no module holds a singleton. `setupListeners` is off unless a plan turns it on.
- A slice is `store/<name>.slice.ts` (`createSlice` with `selectors`) for **client-only** state two
  or more pages or the product's shell read (`theme.slice.ts`); read with `useAppSelector`, write with
  `useAppDispatch`. Server state is the RTK Query cache, never copied into a slice. A side effect <!-- @server -->
  `useAppDispatch`. A side effect <!-- @noserver -->
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

The API sets its tokens as HttpOnly cookies on the page's own origin; the page never reads one.

- **Refresh.** `core/config/api-client.ts` wraps `fetch`: a 401 from the page's own origin, on any
  endpoint except sign-in, sign-up, the OTP calls and the refresh itself, becomes one
  `POST /api/auth/refresh` and one retry. Concurrent 401s share the one refresh (the API rotates
  the refresh token, so a second would be a replay). When the refresh fails the original 401 is
  returned and the guards send the visitor to sign-in.
- **The session hint.** The refresh only runs for a browser that signed in. The cookies are
  unreadable, so `core/auth/session-hint.ts` keeps a `localStorage` flag; without it every
  visitor's session probe would spend one of the API's per-address refresh attempts.
  - It never holds a token or user data (the value is `1`); set after sign-in or sign-up,
    cleared on sign-out.
  - A missing hint with valid cookies (storage blocked) shows the signed-out view until sign-in.
  - A stale hint costs one refresh: a 400, 401 or 403 from `POST /api/auth/refresh` clears it (the
    servers answer 400 `refresh token missing` once the browser dropped the expired cookie). A 429,
    a 5xx or a network error does not, because they say nothing about the cookie.
- **The session is the `getMe` cache entry.** There is no auth slice (a second source of truth).
  `getMe` resolves a visitor's 401 to `null`; any other failure stays an `ApiError`. The root route
  has no loader: the layout renders at once and a guard's `initiate()` or the account menu's
  `useGetMeQuery` is the session read. RTK Query deduplicates them for the same key, so a visitor
  costs one `/api/user/me`.
- **Guards.** `core/auth/guards.ts`: `readSession(store)` returns the `User` or `null`, failing
  closed (logged, except the 401); `requireAccount(store, returnTo?)` throws a redirect to
  `/sign-in?next=…`; `requireRole(store, 'admin', returnTo?)` also sends another role to `/forbidden`; `redirectIfSignedIn(store)` sends an account home. A loader calls
  them: `loader: ({ request }) => requireAccount(store, returnToOf(request))`. The role is the
  API's answer, never a claim in a token; a guard only keeps a visitor off a screen, the API checks
  every call. A guarded page's `noindex` tag is client-rendered; the loader's guard is the
  protection.
- **Sign-in and sign-up.** `login` and `register` resolve to the user only (the tokens never enter
  the store). Inside their `queryFn`, before returning, they set the hint and write the account
  into the `getMe` cache, so the account menu flips without a request and the next loader finds the
  account. The form (`next` is a prop, not a schema field) navigates to `safeNextPath(next)` after the await: a path on this site, else
  `/` (it compares the decoded, lowercased path with the auth screens).
- **Sign-out.** `logout`'s `queryFn` calls the API, logs a failure, clears the hint whatever the
  API said and resolves `{ revoked: boolean }`. `useSignOut` (`store/use-sign-out.ts`) is the one
  action the profile page's `SignOutButton` and the account menu's item both run: it toasts a
  warning after the await when the API could not revoke, then dispatches `api.util.resetApiState()`
  and navigates to `/sign-in`.
- **The account menu** is `AppAccountMenu`, placed by the product. It has three states: a skeleton
  while `getMe` loads, a "Sign in" link and the theme menu for a visitor, the avatar menu (email,
  theme, "Sign out") for an account. The email is in the menu, never header text.
- **Staff pages.** Put them under a pathless route whose loader calls
  `requireRole(store, 'admin', returnToOf(request))`, and give every staff loader the same call.
  No staff page ships.
- **Renaming the roles.** The roles are `user` and `admin`. A product that renames them changes
  `isUser` in `models/user.ts` (another role reads as signed out), every `requireRole(...)` call,
  the role-gated group, the unit tests that use a role, and this file, after the server's roles
  and the `contract` command. A role-gated route also needs a setup in the e2e screens list.

<!-- @server:auth-end -->

## Styling

- **Two homes.** `src/styles/` holds global and app-wide CSS only: `styles.scss`, `setup/`
  (`variables`, `breakpoints`, `functions`, `mixins`, `typography`, `layers`), `themes/`, `basics/`
  (`helpers`, `base`, `layout`); `styles.scss` `@use`s them in that order, and the tree sits in
  cascade layers (`@layer setup, themes, basics`). Every page and component owns a sibling
  `.scss` with its stem and imports it as `import './x.scss'`, the last import of the file; it
  `@use`s `setup/...` only and is never layered, so its rules win over the global ones. A partial
  two sibling files share (`controls.scss`: `input.tsx`, `textarea.tsx`) is imported by each. A
  component renders BEM classes (`.button--primary`, `.page-header__title`) composed with `cn` from
  `@/shared/utils/cn`. `main.tsx` imports Inter, `themes/brand.css`, then `styles.scss`.
  `tests/unit/styles-tree.test.ts` enforces it: `src/styles/` holds only the global tree, every
  sheet has its owner, the owner's import is last, imports are siblings, no `style` attribute,
  `components/` files carry `app-`, and the global partials hold only `@use`, comments and the
  one layer block.
- **Tokens.** The generator writes the brand's light and dark colour blocks, `--radius` and
  `color-scheme` into `themes/brand.css` under `:root` and `[data-theme='dark']`: plain CSS, since
  its placeholders are not valid Sass (`.prettierignore` lists it; it builds only after
  generation). `themes/_light.scss` and `_dark.scss` hold the product's tokens beyond that set
  (surfaces, `--border-strong`, `--focus-ring`, skeleton, `--backdrop`, shadows), the same keys in
  both; `setup/_typography.scss` takes the brand's font stack. Never a literal colour; spacing from `space()`; a hairline border or a 2 px detail is the exception.
  Spacing is the 4 px scale through `space()` (`space(4)` is 16 px); breakpoints `sm` 576, `md` 768,
  `lg` 1024, `xl` 1280, `xxl` 1536 through `breakpoints.up()`; mobile first; logical properties.
- **Theming.** `data-theme` on `<html>` holds the resolved value (`light` or `dark`, never
  `system`). `public/theme-init.js` sets it before first paint from the stored choice or the
  brand's default; it is a file, not an inline script (`script-src 'self'`). `core/theme/theme.ts`
  and the theme slice's listener keep it in step and follow the OS while the choice is `system`.
  Keep script and `theme.ts` in step (key `theme`, same default). No `prefers-color-scheme` block.
- **Sizing.** A control is 36 px on a fine pointer, 32 px under `[data-density='compact']` on a
  fine pointer, 44 px on `(pointer: coarse)` whatever the density; icon buttons the same square.
  Use the `setup/_mixins.scss` mixins in this order: `control-height`, `compact-density`, then
  `touch-target` last, so the size never undoes it. `tests/unit/density.test.ts` compiles the tree
  and asserts the three numbers. No page scrolls horizontally.
- **Primitives** are Radix (`radix-ui`), rendered by `shared/components/` with the tree's classes;
  Radix's data attributes (`data-state`, `data-side`) are the styling hooks. One icon set
  (`lucide-react`, `aria-hidden` next to a label) and one toast implementation (`sonner`, themed
  from the theme slice by `AppProviders`). No scaffolder.
- **Patterns** in `shared/components/`: `Page`, `PageHeader`, `Section`, `EmptyState`,
  `ErrorState` (with retry), `ListSkeleton`, `CardSkeleton`, `FormActions` (sticky on phones),
  `ConfirmDialog`; `AuthCard` with auth. `Page` is the container: `main` has no width and no
  padding, so every route that renders in it (a page, the 404, the group's loading and error) is
  wrapped in `Page`, which carries the width, the gutters and the vertical padding (tighter under
  compact density); a full-bleed screen is a route that renders without it. `AppUserMenu` in
  `components/` is the control the product places in its header; `AppThemeMenu` is its theme items.
  Use a pattern before writing a layout by hand. A page never adds a landmark set; it sets its
  title with a `<title>` element.
- **Forms** use `shared/components/form/`. **Status** is a `Badge` by meaning
  (`success`, `warning`, `destructive`, `muted`, `info`) with words or an icon, never colour alone.
  Semantic HTML, labelled controls; the target is WCAG 2.2 AA, checked by the axe scan.

## Errors

- Every route has a loading and an error state, its own or its group's: `app-main-loading.tsx` and
  `app-main-error.tsx` for the main group, `app-auth-loading.tsx` and `app-auth-error.tsx` for the auth screens,
  `app/root-error.tsx` for what no group caught. A group is a pathless route inside the group's
  layout, so its boundary renders inside `main`, in a `Page`. Every data section has a skeleton that matches
  its layout. Messages are user-safe: no stack trace, query text, internal URL or secret. A
  boundary logs the cause with `console.error`; its Try again button calls `revalidate()`. A lazy
  chunk missing after a redeploy fires `vite:preloadError`; `main.tsx` reloads the page.
<!-- @server-start -->
- The generated client does not throw on an HTTP error status: it returns
  `{ data, error, response }`, and on a network failure `response` is undefined and `error` is the
  thrown value. `call` (`src/services/call.ts`) is the only place that reads the result and returns
  `{ data }` or `{ error: ApiError }` (RTK Query's `queryFn` contract); it does not throw.
- `ApiError` (`models/api-error.ts`) is a plain object, never an `Error` subclass: RTK Query keeps a
  failed query's error in the Redux state, which refuses class instances. A hook's `error` and the
  rejection of `.unwrap()` are the same object; `isApiError` is the guard. A `queryFn` that throws
  loses the copy mapping: return the error.
- The message is copy we wrote: the page's table through `withCopy` (`code:second` when the
  contract adds a discriminator read from `error.details`, then `code`), then the default below. The server's `message` is never
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

  A page overrides entries with its own words (`SIGN_IN_COPY` maps 401 to "Email or password is
  wrong.": the API cannot tell the two apart).

- A handler toasts `error.message` or calls `reportFailure`; a hook reader shows `ErrorState`.
<!-- @server-end -->

## Tests

- Unit tests run with `bun run test` (Vitest, jsdom, React Testing Library): co-located
  `src/**/*.test.ts(x)`. `tests/unit/` holds the tooling checks:
  `eslint-boundaries` (import rules), `styles-tree` (the stylesheet owner, import-last, layer and `app-`
  prefix scans, no `style` attribute, with seeded temporary trees), `density` (compiled sizes), `main-imports` (zod configured first), `zod-config` (no
  `new Function` under the CSP), `playwright-config` (blank `E2E_BASE_URL`), `screen-routes`
  (`capturedRoutes`), and with a database `e2e-database-url`. Co-located checks of the glue include
  `src/store/index.test.ts` and `src/core/config/api-client.test.ts`. <!-- @server -->
  `src/store/index.test.ts`. <!-- @noserver -->
<!-- @server-start -->
- The API is the one boundary: `stubApi` stubs the global `fetch` by `METHOD /path`, so a test goes
  through the real generated client, `call`, the copy tables and the cache. A route is tested with
  `renderRoutes` (a memory router over `createRoutes`, a fresh store); with auth, `renderInRouter`
  renders one component under the store and a router. Mock `sonner` to assert a toast. No test
  starts the server. Drive `revalidate()` through a button, not from the test body.
<!-- @server-end -->
- E2E tests (`tests/e2e/`, Playwright with `@axe-core/playwright`): `playwright.config.ts` starts <!-- @server -->
  the API fresh (`reuseExistingServer: false`, `RATE_LIMIT_SCALE=100`) and the production <!-- @server -->
  build behind `vite preview`, which forwards `/api` to that API. Install the browser once with <!-- @server -->
  `bun x playwright install chromium` (add `--with-deps` on Linux). <!-- @server -->
- E2E tests (`tests/e2e/`, Playwright with `@axe-core/playwright`): `playwright.config.ts` starts <!-- @noserver -->
  the production build behind `vite preview`. Install the browser once with <!-- @noserver -->
  `bun x playwright install chromium` (add `--with-deps` on Linux). <!-- @noserver -->

<!-- @server:database-start -->

- **E2E database.** The server's `e2eDb` command is chained before its start command, on
  `app_e2e`, because Playwright starts web servers before `globalSetup`; the development database
  is never touched. `E2E_DATABASE_URL` overrides the URL, a blank value takes the default, and a
  name that does not end in `_e2e` is refused when the config loads (`scripts/e2e-database-url.ts`,
  unit tested). Container mode starts no API and skips the check.

<!-- @server:database-end -->

<!-- @server-start -->
- **Container mode.** With `E2E_BASE_URL` set (a blank value counts as unset), `bun run test:e2e`
  tests that URL and starts nothing. The API there runs at rate-limit scale 1 with one per-address
  bucket, so the suite can run about once per 15 minutes per stack, and it leaves its accounts in
  that stack's `app` database. The catalog's case runner brings a stack up and down with its
  volumes, so it is unaffected.
<!-- @server-end -->
- **Projects.** `phone` (`devices['Pixel 7']`, touch) runs every journey with its axe scan;
  `desktop` (`devices['Desktop Chrome']`) runs `shell.spec.ts` and `screens.spec.ts`. A check for
  one is tagged `{ tag: '@phone' }` or `{ tag: '@desktop' }` and the other project's `grepInvert`
  leaves it out, so nothing skips at run time. `retries: 0`, a trace is kept on failure: a test
  that passes only on a retry is a failure.
- **Specs.** `shell.spec.ts`: skip link, one `main`, no overflow, the 404 inside `main`, 44 px
  targets (phone), 36 and 32 px densities and the page container's compact padding (desktop), the
  theme script's CSP; a `--density compact` build must pass its phone tests. `smoke.spec.ts`: the
  index route is one `h1` and passes axe, and `GET /api/health` answers 200 through the page's <!-- @server -->
  origin. `auth.spec.ts` (with auth): sign-up, sign-out (the profile page's button), sign-in, a <!-- @server -->
  index route is one `h1` and passes axe. `auth.spec.ts` (with auth): sign-up, sign-out (the profile page's button), sign-in, a <!-- @noserver -->
  wrong password, a taken email on its field, the guarded redirect; `expectSignedIn` reads the
  email on `/profile`.
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
  `account.databaseUrl`, the browser-test database (refused unless its name ends in `_e2e`), and
  never reads a connection string from the environment. With `E2E_BASE_URL` set the entries with a
  `setup` are left out, so a setup never reaches a development or production database. After a
  `setup` the spec signs out and in again through the form (the role is a claim in the session's
  token). Each signed-in test sets its own timeout; no `storageState` setup project. Without a
  database a setup receives no `databaseUrl`.

<!-- @server:auth-end -->

<!-- @server-start -->
- The data rule: a journey creates its data through the API or the UI with a name unique per run,
  and never takes the database's contents as a precondition.
<!-- @server-end -->
- Every new behaviour gets a test for the happy path and at least one for a failure or empty path.
  No `.skip`, `.only`, `test.fixme` or `describe.skip`; a removed test is named in the stage
  report.

## Deployment

- `bun run dev` serves the app on port 5173 (`strictPort`) and proxies `/api` to the server's <!-- @server -->
  port, so the page and the API share one origin in development too. Start the server first, or <!-- @server -->
  the page shows its error state. <!-- @server -->
- `bun run dev` serves the app on port 5173 (`strictPort`). <!-- @noserver -->
- `bun run build` writes `dist/`: `index.html` at its root and hashed files under
  `dist/assets/`, no source maps. `dist/` holds static files only; any static server that falls
  back to `index.html` for a path without an extension can serve it.
<!-- @server-start -->
- The app calls the API at relative `/api` on its own origin, in every environment. No API URL
  is compiled into the bundle and there is no CORS. Whatever serves `dist/` must also route
  `/api` to the server (a reverse proxy, or the server serving the files itself).
<!-- @server-end -->
- Browser-visible configuration is `VITE_*`, read in `src/core/config/env.ts` at build time. Never put a
  secret there.
<!-- @server-start -->
- **Client address.** `CLIENT_IP_HEADER` is a Next-template setting and does not apply here. The
  browser calls `/api` on this app's own origin, so the server sees the browser's address through
  nginx (`split`, which appends it to `X-Forwarded-For`) or directly (`single`), and the per-address
  rate limits work as the server's `TRUST_PROXY` says. The dev and preview servers do not forward
  the client address, so every request they proxy comes from 127.0.0.1 and a rate-limit test in
  development shares one bucket.
- **Cookies.** The API sets the session cookies `Secure` outside development, so a non-loopback
  host needs TLS at an edge (browsers accept `Secure` cookies on `localhost` over HTTP).
<!-- @server-end -->
- **Theme script.** `public/theme-init.js` is copied to `dist/` and served as a file; the CSP is
  `script-src 'self'`, so an inline script would be blocked.
<!-- @server-start -->
- **Two modes**, chosen at generation (`--deploy`).
  - `single` (default): one container. The server serves `dist/` and `/api` on its own port
    (published on every interface), so the page is on the server's port and `5173` is dev-only.
  - `split`: two containers. This package's nginx serves the files on `5173` (published on every
    interface, the public edge) and proxies `/api/` to the server, which is published on
    loopback only.
<!-- @server-end -->
<!-- @noserver-start -->
- Deployed alone, the image's `serve` target is nginx on the template's port; there is no Compose file
  and no deploy mode.
<!-- @noserver-end -->
- **`Dockerfile` targets.** `build` runs a frozen install and `bun run build`. `dist` is
  `FROM scratch` and holds only the built files at `/dist`: the server's image copies it <!-- @server -->
  (`COPY --from=spa /dist ./public`). `serve`, the last and so the default target, is <!-- @server -->
  `FROM scratch` and holds only the built files at `/dist`. `serve`, the last and so the default target, is <!-- @noserver -->
  `nginxinc/nginx-unprivileged:1.31.7-alpine` with the files at `/usr/share/nginx/html`; it runs
  as uid 101, listens on `PORT` (default 5173, above 1024) and has a `wget` healthcheck.
  `.dockerignore` keeps environment files, tests and source maps out of every image.
- **nginx files**, in `nginx/`. `default.conf` is the config template (copied to
  `/etc/nginx/templates/default.conf.template`; the image's entrypoint renders it with
  `envsubst` over `PORT` and `API_URL`). The `@server` markers around its `/api/` proxy are <!-- @server -->
  resolved at generation, so a frontend generated alone has no proxy block. `security-headers.conf` holds the 12 headers of helmet 8.3.0 and is <!-- @server -->
  `envsubst` over `PORT`). `security-headers.conf` holds the 12 headers of helmet 8.3.0 and is <!-- @noserver -->
  included by each static location. Behaviour: `/assets/*` is `immutable`, `index.html` and
  other files `no-cache`, an extension-less path is `index.html`, a missing file with an
  extension, a dotfile and `/assets/` are 404 (never a listing), a path above the root is
  nginx's own 400, and `/api/` is proxied with `X-Forwarded-For` while the server's own headers <!-- @server -->
  pass through untouched. Keep three rules when editing: no `add_header` at server level (a <!-- @server -->
  nginx's own 400. Keep three rules when editing: no `add_header` at server level (a <!-- @noserver -->
  location with its own drops the inherited ones), no dollar sign in a comment (`envsubst`
  rewrites it), and no environment variable named like an nginx variable (`host`, `uri`).
<!-- @server-start -->
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

<!-- @server-end -->
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
