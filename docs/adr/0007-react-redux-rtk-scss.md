# ADR 0007: The React template's own structure on Redux Toolkit, RTK Query and global SCSS

Status: accepted (Eitan, 2026-11-07, on the shape described in the session: "a tree that rhymes
with the Angular one, Redux slices and the RTK Query API in `store/` and `services/`, the global
SCSS tree in place of Tailwind and shadcn"). Catalog release `v1.7.0`, `frontend/react` 3.0.0.
Harness plan 020. Amends [ADR 0003](0003-spa-and-deploy-modes.md) M5-2 and
[ADR 0005](0005-frontend-foundation.md) F1, F2, F6, F8 for the React template; follows
[ADR 0006](0006-per-framework-frontends-and-angular.md), which queued this as the React
follow-up. Follow-up it leaves open: ADR 0008 (Next on the global SCSS tree).

## Context

- `frontend/react` 2.1.1 is the ADR 0005 shape: Feature-Sliced layers (`app/`, `widget/`,
  `feature/<action>/`, `entity/<noun>/`, `shared/`) with Next.js file conventions inside `app/`
  (`(site)/`, `(auth)/`, `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`) in a Vite
  single-page app that has no file-based routing; TanStack Query over Hey API's generated
  options; shadcn components on Tailwind; a flat `tests/unit/`.
- On 2026-11-06 Eitan ruled that frontend structures are per framework and that "the react's app
  file structure should be improved (also switch to redux + rtk which is more familiar)", and that
  the global SCSS tree of the Angular template is the styling rule for every SPA (ADR 0006,
  Context and A2.4). ADR 0006 moved the React layer map out of the conventions into the React
  agents file and named this ADR as the place for the restructure.
- The dev loop, QA, the screens checks and the brand generator consume only the ten invariants of
  `docs/conventions.md › Frontend`. None of them cares how the React package is laid out, so the
  restructure is a template change with no tool change expected (spike S2 checks the one place it
  could touch the generator: the brand placeholders in SCSS, already proven by ADR 0006 S3).
- Redux Toolkit (`@reduxjs/toolkit` 2.14) ships RTK Query, `createSlice`, `createListenerMiddleware`
  and typed hooks; the Redux style guide's "feature folders" and RTK Query's "one API slice,
  endpoints injected per domain" are the industry pattern this template adopts. Radix primitives
  (`radix-ui` 1.8) are already a dependency and are headless, so the design system keeps its
  behaviours (focus trap, roving menus, dialogs) and changes only its styling home.

## Decisions

Each decision lists what it costs. Rows marked ▲ are reconciliations of Eitan's Angular tree with
React's idioms or with the catalog's invariants, explained under the tree.

### R1. The tree

`frontend/react` 3.0.0: Vite 8, React 19, React Router 8 in data mode (loaders, `lazy` pages),
Redux Toolkit with RTK Query, Hey API's fetch client with the flat SDK and zod schemas, React Hook
Form, Radix primitives styled by a global SCSS tree. A breaking restructure: a project generated
from 2.x does not upgrade in place.

```
src/
├── main.tsx                        # zod messages first; brand.css then styles.scss; createStore(); createBrowserRouter(createRoutes(store));
│                                   #   <StrictMode><AppProviders store><RouterProvider/></AppProviders>; dispatches the initial themeChanged
├── vite-env.d.ts
├── app/                            # the wiring; no product logic, no fetch
│   ├── providers.tsx               # <Provider store> · <TooltipProvider> · <Toaster/>
│   ├── routes.tsx                  # createRoutes(store): root (RootError) → main-layout → the features' routes; auth-layout → auth routes (@server:auth)
│   ├── nav.ts                      # the one nav table: NavEntry[] (the e2e screens spec reads it)
│   └── root-error.tsx              # the last-resort boundary: a whole page, no layout
├── core/                           # framework glue below app/ and above features/; never imported by shared/ ▲
│   ├── config/
│   │   ├── env.ts                  # the only reader of import.meta.env (zod); VITE_* values are public
│   │   ├── api-client.ts           # the generated client's runtime config: origin, credentials, fetch with the 401 refresh (@server:auth lines)
│   │   └── constants.ts            # SIGN_IN_PATH, FORBIDDEN_PATH, STORAGE_KEYS, SESSION_STALE_S
│   ├── auth/                       # (@server:auth)
│   │   ├── session-hint.ts         # the localStorage flag "this browser signed in"; never a token
│   │   └── guards.ts               # loader guards over the store: readSession, requireAccount, requireRole, redirectIfSignedIn, returnToOf
│   └── theme/
│       └── theme.ts                # Theme, toTheme, readStoredTheme, resolveTheme (system → matchMedia), applyTheme (data-theme on <html>, storage)
├── layout/
│   ├── main-layout/
│   │   ├── main-layout.tsx         # skip link, <Header>, <main id="main">, <Footer>, <Outlet/>
│   │   ├── main-loading.tsx        # the group's HydrateFallback
│   │   └── main-error.tsx          # the group's ErrorBoundary: ErrorState with retry (resetApiState + revalidate), inside the shell
│   ├── auth-layout/                # (@server:auth)
│   │   ├── auth-layout.tsx         # a centred <main id="main">, the product name, no shell
│   │   ├── auth-loading.tsx
│   │   └── auth-error.tsx
│   └── components/
│       ├── header.tsx              # brand link to '/', <nav aria-label="Primary"> from the `nav` prop (inline from md), MobileNav, the account slot
│       ├── nav-links.tsx           # NavLink lists (inline and in the sheet); NavLink sets aria-current="page"
│       ├── mobile-nav.tsx          # the phone sheet: button "Open menu", dialog "Menu", the same entries
│       ├── footer.tsx
│       ├── user-menu.tsx           # avatar trigger "Account menu", email line, items slot, the theme radio items
│       ├── theme-menu.tsx          # Light / Dark / System menuitemradio over the theme slice
│       └── account-menu.tsx        # (@server:auth) useGetMeQuery: skeleton · "Sign in" link + UserMenu for a visitor · avatar menu with "Sign out"
├── features/                       # one directory per server module or screen group ▲; a feature never imports another
│   ├── health/
│   │   ├── health.routes.tsx       # healthRoutes(store): the index route; loader prefetches getHealth; lazy page
│   │   ├── health.copy.ts          # the refresh toast copy
│   │   ├── pages/home-page.tsx     # export { HomePage as Component }: Page, PageHeader, SystemStatus
│   │   └── components/{system-status,system-status-skeleton,health-badge,refresh-health-button}.tsx
│   ├── auth/                       # (@server:auth)
│   │   ├── auth.routes.tsx         # sign-in and sign-up under auth-layout; loaders redirectIfSignedIn
│   │   ├── auth.form.ts            # signInSchema, signUpSchema over the generated zod request schemas
│   │   ├── auth.copy.ts            # SIGN_IN_COPY, SIGN_UP_COPY
│   │   ├── pages/{sign-in-page,sign-up-page}.tsx
│   │   └── components/{sign-in-form,sign-up-form}.tsx
│   ├── user/                       # (@server:auth)
│   │   ├── user.routes.tsx         # profile: loader requireAccount
│   │   ├── pages/profile-page.tsx
│   │   └── components/profile-card.tsx
│   ├── forbidden/                  # (@server:auth) forbidden.routes.tsx, pages/forbidden-page.tsx: role.guard's target
│   └── not-found/                  # not-found.routes.tsx ('*' inside the main layout), pages/not-found-page.tsx
├── store/
│   ├── index.ts                    # createStore(preloaded?): configureStore(api reducer + middleware, theme, listener middleware); AppStore, RootState, AppDispatch ▲
│   ├── hooks.ts                    # useAppDispatch, useAppSelector (withTypes)
│   ├── listeners.ts                # createListenerMiddleware: themeChanged → applyTheme and the OS watcher while the choice is system
│   └── theme.slice.ts              # { choice: Theme }; themeChanged; selectTheme
├── services/                       # the data layer: the only directory that imports the generated runtime ▲
│   ├── generated/                  # Hey API output: types, the fetch client, the flat SDK, zod. Committed, never edited, ignored by lint and Prettier
│   ├── api.ts                      # createApi({ reducerPath: 'api', baseQuery: fakeBaseQuery<ApiError>(), tagTypes, endpoints: () => ({}) })
│   ├── call.ts                     # the one reader of a generated result → { data } | { error: ApiError }; the copy lookup; the request-id log
│   ├── health.api.ts               # api.injectEndpoints: getHealth (query, providesTags Health), refreshHealth (mutation, invalidatesTags Health); the hooks
│   ├── auth.api.ts                 # (@server:auth) login, register, logout; onQueryStarted writes the session hint and the getMe cache
│   └── user.api.ts                 # (@server:auth) getMe (providesTags User)
├── shared/                         # product-agnostic; imports shared/ and models/ only
│   ├── components/                 # the design system: Radix primitives rendered with the styles tree's class names; one file per component
│   │   ├── button.tsx, badge.tsx, card.tsx, avatar.tsx, alert.tsx, separator.tsx, skeleton.tsx, spinner.tsx
│   │   ├── input.tsx, textarea.tsx, label.tsx, checkbox.tsx, radio-group.tsx, switch.tsx, select.tsx
│   │   ├── dialog.tsx, sheet.tsx, dropdown-menu.tsx, tooltip.tsx, tabs.tsx, toaster.tsx (sonner)
│   │   ├── page.tsx (Page, PageHeader, Section), empty-state.tsx, error-state.tsx, skeletons.tsx (ListSkeleton, CardSkeleton),
│   │   │   form-actions.tsx, confirm-dialog.tsx, auth-card.tsx (@server:auth)
│   │   └── form/                   # React Hook Form bindings: form.tsx, field-frame.tsx, use-field.ts, text-field.tsx, textarea-field.tsx,
│   │                               #   number-field.tsx, select-field.tsx, checkbox-field.tsx, password-field.tsx, date-time-field.tsx, report-failure.ts
│   ├── hooks/                      # use-media-query.ts and other DOM hooks with no product meaning
│   └── utils/                      # cn.ts (clsx), date.ts (zone-aware), next-path.ts (safeNextPath), storage.ts (safe localStorage), zod-messages.ts
├── models/                         # one file per glossary noun: the contract's types re-exported, UI-only shapes, pure helpers ▲
│   ├── api-error.ts                # ApiError (a plain object), ErrorCode, isApiError
│   ├── health.ts                   # HealthView
│   ├── nav.ts                      # NavEntry
│   └── user.ts                     # (@server:auth) User (= PublicUser), Role, initials()
├── testing/                        # test-only helpers: render-routes.tsx (a memory router over createRoutes with a fresh store), stub-api.ts
└── styles/                         # the only home of CSS; a component file carries no stylesheet import and no style attribute
    ├── styles.scss                 # @use setup → themes → basics → components → views
    ├── setup/{_variables,_breakpoints,_functions,_mixins,_typography}.scss
    ├── themes/
    │   ├── brand.css               # :root { __THEME_LIGHT__ --radius } [data-theme='dark'] { __THEME_DARK__ }; color-scheme (plain CSS, see R5)
    │   ├── _index.scss
    │   ├── _light.scss             # product tokens beyond the generated set, light values
    │   └── _dark.scss              # the same keys, dark values
    ├── basics/{_helpers,_base,_layout}.scss
    ├── components/_index.scss + one partial per shared and layout component (_button, _controls, _header, _user-menu, _sheet, _menu, ...)
    └── views/_index.scss + {_home,_sign-in,_sign-up,_profile,_forbidden,_not-found}.scss

public/theme-init.js                # sets data-theme (resolved) before first paint; a file, never inline (CSP script-src 'self')
tests/
├── e2e/{shell,screens,smoke,auth}.spec.ts, screen-routes.ts (ROUTES helper and SIGNED_IN_ROUTES ▲), support.ts, auth-support.ts
└── unit/                           # tooling checks only: eslint-boundaries, restricted-elements, playwright-config, e2e-database-url, main-imports,
                                    #   styles-tree (no stylesheet import or style attribute outside main.tsx), density (the compiled CSS), zod-config
scripts/e2e-database-url.ts
index.html, vite.config.ts, vitest.config.mts, vitest.setup.ts, tsconfig*.json, eslint.config.mjs, openapi-ts.config.ts, playwright.config.ts,
package.json, bun.lock, Dockerfile, nginx/{default.conf,security-headers.conf}, .dockerignore, .prettierrc, .prettierignore, .env.example
```

The reconciliations, each with its reason:

- **`core/` exists in React too.** Loader guards are used by `app/routes.tsx` and by every
  feature's routes file, and they reach the store; a feature may not import `app/` (the cycle
  `app → features → app`), and `shared/` may not know the store. The directory that both may
  import and that may reach `store/` and `services/` is `core/`, as in the Angular template. It
  holds glue only: configuration, the auth guards and hint, the theme DOM logic. The React
  equivalents of Angular's interceptors are the fetch wrapper in `core/config/api-client.ts` and
  the mapping in `services/call.ts`; of its initializers, the root route's loader.
- **`features/<module>` mirrors the server's modules** (`health`, `auth`, `user`) plus the screen
  groups (`forbidden`, `not-found`), as Angular's do, replacing the verb-named `feature/<action>`
  slices and the `widget/` and `entity/` layers. A feature holds its routes file, its pages, its
  components, its form schemas and its copy. What two features both need is lifted to `shared/`
  (product-agnostic) or `models/` (a noun's helpers), never imported sideways.
- **`store/` is slices and wiring; `services/` is the API.** The RTK Query API is `createApi` in
  `services/api.ts` with its endpoints injected per server module (`services/<module>.api.ts`),
  the layout RTK Query documents; `store/index.ts` mounts its reducer and middleware. A slice is
  client-only state shared across features (`theme.slice.ts` is the worked example); server
  state is the RTK Query cache and never copied into a slice. Components call the generated hooks
  (`useGetHealthQuery`) and the typed `useAppSelector`; there is no store facade in between,
  because the hooks are RTK Query's component API and a facade would duplicate them.
- **`services/generated/`** is the Hey API output, where the Angular template keeps it. Only
  `services/` imports its runtime; `core/config/api-client.ts` is the generated client's
  `runtimeConfigPath` and imports only a type from it; `models/` and a feature's `*.form.ts`
  import its types and zod schemas (a form schema extends the generated request schema, invariant
  1). The TanStack Query plugin is dropped; the flat SDK, the fetch client, the types and zod stay.
- **`models/<noun>.ts` is a file, not a folder.** A noun's types, its UI-only shapes and pure
  helpers (`initials`) fit one file; a folder is opened when one does not.
- **`ApiError` is a plain object**, not an `Error` subclass: RTK Query stores a failed query's
  error in the Redux state, and the serializability middleware refuses class instances. `call`
  returns `{ data } | { error }` (RTK Query's `queryFn` contract) instead of throwing; a hook's
  `.unwrap()` rejects with the object; `isApiError` is the guard. The copy rule is unchanged:
  the message is the feature's copy table entry for the envelope's `code`, then the default; the
  server's text never reaches the page.
- **No `auth.slice`.** The session is the `getMe` cache entry; the account menu and the profile
  read `useGetMeQuery()`, the guards `store.dispatch(userApi.endpoints.getMe.initiate())`. A
  slice beside it would be a second source of truth. The side effects of signing in (the session
  hint, writing the `getMe` cache from the login response) are `onQueryStarted` on the auth
  endpoints, RTK Query's place for post-mutation cache writes; the side effects of the theme slice
  are a listener. Each mechanism appears once, in the file the recipe names.
- **Pages are `lazy` route modules.** `features/<f>/<f>.routes.tsx` is eager and holds the
  loaders (they close over the store); each page module exports `Component` and is loaded with
  React Router's `lazy`, so every route is its own chunk. The group's `HydrateFallback` covers
  both the module and the loader.
- **`features/<f>/<f>.routes.tsx` is a function of the store** (`healthRoutes(store)`), composed
  by `app/routes.tsx`'s `createRoutes(store)`, so a test renders the table against its own store
  and no module holds a singleton. `main.tsx` is the one place a store is created for the page.
- **The styles tree is Eitan's**, with the Angular template's `brand.css` fallback: a bare
  `__THEME_LIGHT__` line is not valid Sass, so the generated token blocks sit in plain CSS that
  `main.tsx` imports before `styles.scss`. The dark selector is `[data-theme='dark']` (the tree's
  rule and Angular's); `theme-init.js` and `applyTheme` write the resolved value, never `system`.
  The shadcn densities stay as numbers (36 px fine pointer, 32 px compact, 44 px coarse), so the
  desktop e2e keeps its assertions.
- **Co-located unit tests** (`*.test.tsx` beside the file) are the React and Vitest idiom;
  `tests/unit/` keeps the checks on files outside `src/` and the tree-wide scans, as the Angular
  template does. The e2e set is unchanged; `SIGNED_IN_ROUTES` moves next to `capturedRoutes` in
  `tests/e2e/screen-routes.ts`, where the Angular template keeps its list, so the harness's frontend
  agent names one file for both SPAs.
- **`src/testing/`** holds the test helpers (`renderRoutes`, `stubApi`) that co-located tests
  import through `@/testing/…`; `tsc` and lint cover it, Vite never bundles it (nothing in `src/`
  outside tests imports it, and the boundaries rule forbids it).
- **Nothing new in scope.** No `i18n` or `pwa` flag, no side-nav layout, no data table, no
  network badge: the template keeps React 2.x's screens and journeys on the new structure. Each
  is a backlog line (Out of scope).

#### R1.1 Layers and import rules

`eslint-plugin-boundaries` element types and what each may import. A feature never imports another
feature; `shared/` never imports `core/`, `store/` or `services/`. Every message names the layer to
use instead; `tests/unit/eslint-boundaries.test.ts` lints one violation and one allowed case per row.

| From | May import |
| --- | --- |
| `app/` | layout, features (`*.routes.tsx` only), core, store, shared, models |
| `layout/` | core, store, services (the hooks), shared, models |
| `features/<f>/` | core, store, services (the hooks), shared, models; its own feature |
| `features/<f>/*.form.ts` | shared, models, the generated zod schemas (`@/services/generated/zod.gen`) |
| `store/` | services (reducer, middleware, matchers, `util`), `core/theme`, `core/config`, models |
| `services/` | `services/generated`, `core/config`, `core/auth`, models |
| `core/auth/guards.ts` | store, services, `core/config`, models (the wiring) |
| `core/config`, `core/auth/session-hint.ts`, `core/theme` | shared, models, and each other (the leaves) |
| `shared/` | shared, models |
| `models/` | the generated types and zod schemas, `import type` only |
| `testing/` | anything (test-only); nothing outside `*.test.tsx` imports it |

Also lint-enforced: the `services/generated` runtime is imported only in `services/`; its types
only by `services/`, `store/`, `core/` and `models/` (`core/config/api-client.ts` imports the
`CreateClientConfig` type; every other layer reads the contract's types through `models/`);
`fetch(` only in `core/config/api-client.ts`; `import.meta.env` only in `core/config/env.ts`; the
`button`, `input`, `select` and `textarea` JSX elements only inside `shared/components/`; the
`style` JSX attribute nowhere; a `.css` or `.scss` import nowhere but `main.tsx`
(`tests/unit/styles-tree.test.ts` scans for the last two).

Why: the Angular rules ("pages read stores, never services"; "shared never imports core") become
checkable in React's terms, where the RTK Query hooks are the component API: a page reads the
hooks and the slices, a hook reads the SDK, nothing reads `fetch`.

Cost: a page that wants a one-off request has to add an endpoint to `services/<module>.api.ts`
first. That is the point.

### R2. Data flow

Component → RTK Query hook (`services/<module>.api.ts`) or a slice selector → `services/call.ts`
→ the generated SDK → the fetch client (`core/config/api-client.ts`).

- **Reads.** `build.query` with `queryFn: () => call(getApiHealth())` and `providesTags`. A route
  loader prefetches: `const sub = store.dispatch(healthApi.endpoints.getHealth.initiate()); try {
  return await sub.unwrap() } finally { sub.unsubscribe() }`; the page then calls
  `useGetHealthQuery()` and finds the entry. The hook does not refetch within
  `refetchOnMountOrArgChange: 30` (seconds), the equivalent of the 30 s staleness of 2.x;
  `keepUnusedDataFor` stays at its 60 s default. Spike S1 records whether the loader's subscription
  must outlive the first render for the single fetch.
- **Mutations.** `build.mutation` with `queryFn` and `invalidatesTags`; the component awaits
  `trigger().unwrap()` and shows the outcome after the await: a toast, or `reportFailure(form,
  error)` for a form. Never a toast from an effect, a listener or the client (invariant 3).
- **Failure.** `call` maps a non-ok response to `{ error: ApiError }` with our copy and logs a 5xx,
  a missing envelope or an unreachable API with the request id first; the hook exposes it as
  `error`, the loader's `unwrap()` rejects with it and the group's boundary renders `ErrorState`.
  Retry dispatches `api.util.resetApiState()` and revalidates (S1 records whether the reset is
  needed for a rejected entry). The root loader never throws for a visitor.
- **Tags.** One tag per server module (`Health`, `User`); a mutation invalidates the tags of the
  entities it changes, so every subscribed widget refetches.

Why: Eitan asked for Redux and RTK Query; one cache with tags replaces query keys and manual
invalidation. Cost: no stale-while-revalidate per query (RTK Query refetches on mount or arg
change by time, not by staleness); a product that needs finer cache control sets per-endpoint
options.

### R3. Store

`store/index.ts` exports `createStore(preloaded?)`: `configureStore` with `api.reducer` under
`api.reducerPath`, `theme.reducer`, the default middleware plus `api.middleware` and the listener
middleware from `store/listeners.ts`; `setupListeners` is not used (no refetch on focus or
reconnect by default; a product turns it on by plan). `AppStore`, `RootState` and `AppDispatch` are
inferred types; `store/hooks.ts` exports `useAppDispatch` and `useAppSelector` via `withTypes`.

A slice (`store/<name>.slice.ts`, `createSlice`) is client-only state that two or more features or
the layout read: the theme choice today; a draft, a filter set, a wizard's step tomorrow. Server
state lives in the RTK Query cache. A side effect of a slice action is a listener in
`store/listeners.ts` (`startListening({ actionCreator, effect })`); a side effect of an API call is
`onQueryStarted` on that endpoint. `main.tsx` dispatches `themeChanged(readStoredTheme(default))`
once after creating the store, so boot and a later change take the same path.

Cost: the serializability middleware shapes what may enter the store (plain objects, no `Date`,
no class instances); `ApiError` and the models follow it.

### R4. Forms

React Hook Form with `zodResolver` and the RTK Query mutation hook; `SignInForm` is the pattern.
The schema is in `features/<f>/<f>.form.ts` and extends the generated request schema; limits are
never copied. `<Form form onSubmit>` provides the context; the fields in `shared/components/form/`
take `name` and `label` and render the label, the control, `aria-invalid`, `aria-describedby` and
the error line. `reportFailure(form, error)` puts an `ApiError` that carries `fieldErrors` on its
fields and toasts anything else; a path the form has no field for is toasted.

### R5. Styling

- `src/styles/` is the only home of CSS: `main.tsx` imports `themes/brand.css` then `styles.scss`;
  no other file imports a stylesheet and no component sets a `style` attribute
  (`tests/unit/styles-tree.test.ts`). A component renders class names from the tree (BEM:
  `.button`, `.button--primary`, `.header__brand`), composed with `cn` (clsx).
- **Tokens.** The generated blocks (`__THEME_LIGHT__`, `__THEME_DARK__`, `__THEME_RADIUS__`) sit in
  `themes/brand.css` under `:root` and `[data-theme='dark']` with `color-scheme`;
  `setup/_typography.scss` takes `__THEME_FONT_STACK__`; `index.html` takes
  `data-density="__THEME_DENSITY__"`. `_light.scss` and `_dark.scss` hold the product's tokens
  beyond the generated set (surfaces, border-strong, focus ring, skeleton, backdrop, shadows), the
  same keys in both. The brand generator, its contrast checks and the QA rubric are untouched
  (invariant 6). A component never writes a literal colour or size; spacing is the 4 px scale
  (`space(4)` is 16 px), breakpoints Eitan's (`sm` 576, `md` 768, `lg` 1024, `xl` 1280, `xxl`
  1536), mobile first, logical properties.
- **Theming.** `data-theme` on `<html>` always holds the resolved value; `theme-init.js` sets it
  before first paint from the stored `theme` key or the brand's default; `core/theme/theme.ts`
  `applyTheme` keeps it in step and the listener follows the OS while the choice is `system`. No
  `prefers-color-scheme` block duplicates the generated tokens.
- **Sizing.** Controls are 36 px on a fine pointer, 32 px under `[data-density='compact']`, and 44
  px under `(pointer: coarse)` whatever the density (the `touch-target` mixin, applied after the
  size); icon buttons the same square. `tests/unit/density.test.ts` compiles the tree and asserts
  the three numbers; the shell e2e asserts them in the browser.
- **Primitives** are Radix (`radix-ui`), rendered by `shared/components/` with the tree's classes;
  Radix's data attributes (`data-state`, `data-side`) are the styling hooks for open, checked and
  placement. No scaffolder: a new component is a file in `shared/components/` and a partial in
  `styles/components/`. One icon set (`lucide-react`, `aria-hidden` next to a label) and one toast
  implementation (`sonner`, themed from the slice) per template.
- **Patterns**: `Page`, `PageHeader`, `Section`, `EmptyState`, `ErrorState`, `ListSkeleton`,
  `CardSkeleton`, `AuthCard`, `FormActions`, `ConfirmDialog`, `UserMenu`, the shell in
  `layout/main-layout`: the `ui-design` rubric's names, unchanged from 2.x. Status is a `Badge` by
  meaning with words or an icon. Semantic HTML, labelled controls, WCAG 2.2 AA by the axe scan.

Why: the SCSS tree is the rule for every SPA (ADR 0006); Radix keeps the accessibility behaviours
the shadcn components had without their styling runtime. Cost: `tailwind`, `tw-animate-css`,
`tailwind-merge`, `class-variance-authority` and `components.json` go; every component is restyled;
the Tailwind-era `pointer-coarse:` and `compact:` variants become mixins.

### R6. Auth

The server sets HttpOnly cookies; the page never reads a token.

- **Refresh.** `core/config/api-client.ts` wraps `fetch`: a 401 from any endpoint except sign-in,
  sign-up, the OTP calls and the refresh itself becomes one `POST /api/auth/refresh` and one retry;
  concurrent 401s share the one refresh; a refresh 400, 401 or 403 clears the session hint; a 429,
  5xx or network failure does not. Unchanged from 2.x, moved.
- **The session hint** is `core/auth/session-hint.ts`: set in `onQueryStarted` of `login` and
  `register` after `queryFulfilled`, cleared when `logout` settles.
- **Guards** (`core/auth/guards.ts`): `readSession(store)` dispatches `getMe.initiate()` and
  returns the account or `null` (a 401, or any failure, fails closed and is logged unless it is
  the 401); `requireAccount(store, returnTo?)` throws `redirect('/sign-in?next=…')`;
  `requireRole(store, 'admin', returnTo?)` sends another role to `/forbidden`;
  `redirectIfSignedIn(store)` sends an account home from the auth screens. The root route's
  loader calls `readSession` once so the header's `useGetMeQuery` finds the entry. The role is the
  API's answer; the API checks every call.
- **Sign-in and sign-up** write `userApi.util.upsertQueryData('getMe', undefined, session.user)`
  in `onQueryStarted`, so the header flips without a request; the form navigates to
  `safeNextPath(next)` after the await. **Sign-out** calls the API, then clears the hint and
  dispatches `api.util.resetApiState()` whatever the API said, and the handler navigates to
  `/sign-in`.
- **The account slot** is `layout/components/account-menu.tsx`: a skeleton while `getMe` is
  loading, a "Sign in" link and the theme menu for a visitor, the avatar menu (email, theme,
  "Sign out") for an account. The email is in the menu, never header text. `/forbidden` is a
  feature. Renaming the roles edits `models/user.ts`'s guard, every `requireRole` call, the tests
  and the agents file, after the server and `contract`.

### R7. Tests and e2e

Unit: Vitest, jsdom, Testing Library, `src/**/*.test.{ts,tsx}` co-located plus
`tests/unit/**/*.test.ts`. Components: props in, roles and text out, `userEvent` for input. The
API is the one boundary: `stubApi` (`src/testing/stub-api.ts`) stubs `fetch` by `METHOD /path`, so
a test goes through the real generated client, `call`, the copy tables and the RTK Query cache. A
route is tested with `renderRoutes` (`src/testing/render-routes.tsx`: a memory router over
`createRoutes` with a fresh store per test). Mock `sonner` to assert a toast. The template tests
its own glue once: `call`, the refresh collapse (two concurrent 401s, one refresh), the guards,
the theme slice and listener, the shell nav, the user and account menus, the form fields and
`reportFailure`, each auth form's success and failure, the health card and its refresh, the date
helpers, `safeNextPath`, and the tooling checks.

E2E: unchanged in intent and almost unchanged in text. `playwright.config.ts` keeps `phone` and
`desktop`, `E2E_BASE_URL`, `reuseExistingServer: false`, `retries: 0`, `vite build && vite
preview`, the `e2eDb && start` chain and `RATE_LIMIT_SCALE=100`. `shell.spec` asserts the
landmarks, the skip link, no overflow, the 44 px targets on `@phone`, the 36 and 32 px densities on
`@desktop`, the theme switch through `data-theme` (was the `dark` class), the theme script's content
type and no CSP violation. `screens.spec` captures every nav route plus the auth screens in both
themes and checks axe WCAG A and AA, overflow and one `h1`; `SIGNED_IN_ROUTES` lives in
`tests/e2e/screen-routes.ts`. `smoke.spec` and `auth.spec` keep their role-and-name selectors
(`Account menu`, `Open menu`, `Menu`, `Sign out`, `Refresh`, the field labels).

### R8. Build and tooling

- `package.json` scripts as 2.x: `dev`, `build`, `preview`, `typecheck` (`tsc -b`), `lint`,
  `format`, `format:check`, `test`, `test:watch`, `test:e2e`, `api:types`, `check`.
- Dependencies: add `@reduxjs/toolkit`, `react-redux`, `sass-embedded` (dev); remove
  `@tanstack/react-query`, `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `tailwind-merge`,
  `class-variance-authority`, `components.json`. Keep `radix-ui`, `lucide-react`, `sonner`, `clsx`,
  `react-hook-form`, `@hookform/resolvers`, `zod`, `date-fns`, `@date-fns/tz`,
  `@fontsource-variable/inter`, the Hey API generator (exact pin), React Router (exact pin) and
  the test and lint set. The versions table below is re-verified at build.
- `openapi-ts.config.ts`: `output.path: 'src/services/generated'`, plugins `@hey-api/typescript`,
  `@hey-api/client-fetch` with `runtimeConfigPath: './src/core/config/api-client.ts'`,
  `@hey-api/sdk` (`flat`), `zod`. No TanStack plugin.
- `vite.config.ts`: `react()`, the `@` alias, the `/api` proxy, `strictPort`, no source maps;
  `css.preprocessorOptions.scss.loadPaths: ['src/styles']` so a partial `@use`s `setup/…`.
- `vitest.config.mts`: jsdom, `include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.ts']`,
  `allowOnly: false`, `passWithNoTests: false`, the setup file with the jsdom stand-ins Radix needs.
- `eslint.config.mjs`: `typescript-eslint` strictTypeChecked, `react-hooks`, `jsx-a11y`,
  `boundaries` with R1.1's table, the `no-restricted-syntax` and `no-restricted-imports` rules;
  `eslint-import-resolver-typescript` is mandatory (ADR 0006 S2: without it violations are missed).
- `Dockerfile`, `nginx/`, `compose.yaml`, `.dockerignore`: unchanged (Vite's `dist/assets/*`
  layout is the same).
- `template.yaml`: `version: 3.0.0`, the summary, `onlyWhen` paths for the new tree, `defaultStack`
  `react-python-fastapi`, `postGenerate: [install, contract, format]`, `gitignore: [node]`.

### R9. Manifest, cases, release

- `tests/cases.yaml` unchanged in set: `default`, `split`, `bun`, `alone`, `auth-off`,
  `auth-off-postgres`, `brand`.
- `frontend/react` 3.0.0 (the layout moves every file); catalog `v1.7.0`, a minor (a template's
  own major is a catalog minor, as `v1.4.0` was for `react` 2.0.0). `index.yaml`, the README
  matrix (`validate --readme`), `CHANGELOG.md` with a Breaking section. The stacks are unchanged.
- `CONTRIBUTING.md`: "Adding a frontend template" names the two models as `react` (RTK Query,
  Radix on the SCSS tree) and `angular`; "Refreshing `frontend/react/base`" loses its shadcn step.
  ADR 0003 M5-2 and ADR 0005 F1, F2, F6 and F8 get an "amended by ADR 0007" line.
- Proof the harness owns: a bootstrap of `react-bun-express` from the harness in a disposable
  clone against this branch of the catalog and one dev-loop task on it (plan 020's proof step).

### R10. The harness

ADR 0006 A3 already made the harness layer-agnostic. What still names React 2.x's shape, for plan
020:

| File | Today | Becomes |
| --- | --- | --- |
| `.doc/glossary.md › Actions` | "React and Next features are actions (`feature/<action>`); Angular features are nouns" | "Next features are actions (`feature/<action>`); React and Angular features mirror the server's modules (`features/<noun>`)"; the glossary still lists each action beside the nouns |
| `.claude/skills/ui-design/SKILL.md` | "These names are the React and Next ones; … (Angular, in `shared/components/`: …)" | "These names are the React and Next ones (React in `shared/components/`); Angular's equivalents are listed in its `AGENTS.md › Styling`" |
| `.claude/skills/error-handling/SKILL.md` | "React and Next: `call` throws an `ActionError`"; "React: `mutateAsync`, `reportFailure`" | "Next: `call` throws an `ActionError`; React: `call` returns an `ApiError` result the RTK Query hook exposes and `.unwrap()` rejects with; Angular: the interceptor builds an `ApiError`"; "React: `.unwrap()`, `reportFailure`" |
| `.claude/skills/writing-plans/template.md` | "React: entity, feature, widget, route" | "React: model, service endpoints, feature (routes, page, components), nav entry, view partial" |
| `.claude/agents/frontend.md` | "React: `ROUTES` and `SIGNED_IN_ROUTES` … in `screens.spec.ts`; Angular: … in `tests/e2e/screen-routes.ts`" | "`SIGNED_IN_ROUTES` (and Angular's `AUTH_ROUTES`) in `tests/e2e/screen-routes.ts`" |
| `catalog.lock` | v1.6.0 | v1.7.0, in its own pull request after the release |

## Alternatives considered

- **Keep Feature-Sliced Design and only switch the data library.** Rejected: Eitan asked for the
  structure to change, and the Next-style file names inside `app/` were the part that read as
  magic in a router that has none.
- **Mirror the Angular tree file for file** (`core/providers`, `core/interceptors`, store facades
  over services). Rejected where React has an idiom of its own: RTK Query's hooks are the
  component API, a fetch wrapper is the interceptor, a route loader is the initializer.
- **`@rtk-query/codegen-openapi` for the API slice.** Rejected: it would be a second generator
  beside Hey API (which the zod schemas and invariant 1 need), with a second set of types for the
  same contract. One generator, and one `queryFn` line per endpoint, is explicit and cheap.
- **A `fetchBaseQuery` with the raw paths.** Rejected: it would drop the generated SDK and type the
  endpoints by hand (invariant 1 forbids hand-written API types).
- **An `auth` slice holding the user.** Rejected: a second source of truth beside the `getMe`
  cache entry; the login response is written into that entry instead.
- **TanStack Query kept beside Redux.** Rejected: two caches, two vocabularies; Eitan asked for
  Redux because it is familiar.
- **Base UI instead of Radix.** `@base-ui-components/react` is at 1.0.0-rc on the registry;
  Radix is stable, already installed and documented everywhere. Revisit when Base UI is stable.
- **Hand-rolled primitives on `<dialog>` and the Popover API.** Rejected: menus with roving focus
  and typeahead are weeks of accessibility work the template would own forever.
- **Tailwind kept under the SCSS tree.** Rejected: the tree is the rule for every SPA (ADR 0006).
- **`tests/unit/` for everything.** Rejected: co-location is the React and Vitest idiom; the
  tooling checks test files outside `src/` and stay.
- **Flags for `i18n` and `pwa` in this release.** Deferred: the request is the structure; each
  flag is its own feature and its own case set.

## Consequences

- The catalog carries three frontend vocabularies (Next's layers, React's modules, Angular's
  modules); the harness carries none, and the glossary says which frontends name a feature by the
  server's module.
- A project generated from `react` 2.x does not upgrade in place; the changelog says so.
- The React and Next templates no longer share a design system file for file; the `ui-design`
  rubric's pattern names are shared by contract, not by code.
- Errors in React are plain objects; a project that throws from a `queryFn` loses the copy
  mapping. The agents file says so under `Errors`.
- Every component is restyled once; the e2e suite is the proof that the shell, the targets and
  the densities survived.

## Out of scope

Next on the SCSS tree (ADR 0008). Vue. An `i18n` flag (react-i18next or Lingui, Hebrew, RTL) and a
`pwa` flag (`vite-plugin-pwa`) for React, each its own ADR or minor. A side-nav layout. A data
table. A network badge and offline refusal. `setupListeners` (refetch on focus and reconnect).
Proposed backlog lines: `- [ ] react: i18n flag (en/he, RTL) on the SCSS tree`,
`- [ ] react: pwa flag (manifest, icons, vite-plugin-pwa)`, `- [ ] next: the global SCSS tree (ADR 0008)`.

## Spikes (throwaway, before the plan's build steps)

- **S1. RTK Query under React Router loaders.** `fakeBaseQuery` with a `queryFn` over `fetch`; a
  loader that prefetches with `initiate()` and `unwrap()`; a `lazy` page exporting `Component`
  that calls the hook and renders once with ONE fetch; a 503 that rejects the loader with the plain
  error and renders the boundary; Retry after `resetApiState` and `revalidate`; no serializability
  warning; a mutation that invalidates the tag; a listener on a slice action; a fresh store per
  Vitest test. Records which option stops a second fetch and whether the reset is needed.
- **S2. The SCSS tree under Vite.** `sass-embedded` compiles the `@use` tree; `brand.css` with the
  bare placeholders: what `vite build` and `vite dev` do in place (fail, warn, pass), and that the
  substituted file builds to `dist/assets/*.css`; Vitest ignores the in-place CSS.
- **S3. Peers.** ESLint 10 with `jsx-a11y` 6.10, `react-hooks` 7.1, `boundaries` 7.4,
  `typescript-eslint` 8.72 and TypeScript 5.9; `@hookform/resolvers` 7 with zod 4 and React Hook
  Form 7.91; React 19.3, RTK 2.14 and react-redux 9.3. Records every peer warning.

## Left to the builder

The recipe text under `Adding a feature`; the exact SCSS partial list and the BEM names; the Radix
data-attribute selectors per component; the `renderRoutes` and `stubApi` signatures; the
`restricted-elements` mechanism (the 2.x `no-restricted-syntax` selectors, extended with `style`);
the `styles-tree` scan; the health page's composition against the `ui-design` rubric; the
`.env.example` content (unchanged in meaning); the changelog text.

## Decisions made while building

Rulings taken during plan 020 that changed or sharpened the text above (the plan's ledger in the
harness holds the full record). A row of R1.1 moved by a ruling is amended in place and its reason
recorded here.

Spike results (S1 to S3, 2026-11-07; Bun 1.4.0, Node 24.15.0, every version of the table below
resolved exactly):

- **S1 passed with the defaults.** The loader's `initiate()` plus `unwrap()` and an immediate
  `unsubscribe()` leave the entry in the cache (`keepUnusedDataFor` 60 s) and the page's hook
  reuses it: one fetch. A 503 rejects `unwrap()` with the plain `ApiError`, which
  `useRouteError()` receives unchanged (not wrapped, not an `Error`); the store holds it with no
  serializability warning. **Retry is `revalidate()` alone**: a rejected entry with no subscriber
  is refetched by the next `initiate()`, so `api.util.resetApiState()` is not needed and would
  drop every cached read (the session included); R2 and `main-error.tsx` follow this. A mutation
  with `invalidatesTags` refetches the query; the listener fires on the slice action; a `lazy`
  page exporting `Component` resolves under Vitest and builds to its own chunk; `lazy` and
  `loader` run in parallel. Test pitfall: drive `revalidate()` through a button in a test, not
  from the test body.
- **S2 passed; the in-place build fails as expected.** `sass-embedded` is what Vite 8 picks;
  the substituted `brand.css` builds to `dist/assets/index-HASH.css` in 2.4 s. In place, with the
  bare placeholders, `vite dev` serves silently and `vite build` fails at lightningcss's minify
  (`Unexpected token Ident("--radius")`), as 2.x's `globals.css` did; accepted. Vitest does not
  process the CSS, so `check` runs in place. **Prettier refuses the placeholder file**, so
  `.prettierignore` lists `src/styles/themes/brand.css` (the Angular template's entry too) beside
  `src/services/generated/`. lightningcss rewrites `oklch(1 0 0)` as `oklch(100% 0 0)` and adds
  `--lightningcss-light`/`-dark` toggles for `color-scheme`; nothing reads the built CSS text.
- **S3: ESLint stays at 9.39.x.** `eslint-plugin-jsx-a11y` 6.10.2 peers `^3 … ^9`; every other
  plugin peers 10, and 10 ran, but with a peer warning on every install. React and Next keep one
  ESLint (9) as before; Angular needs 10 for angular-eslint. `typescript-eslint` 8.72.1 peers
  TypeScript `<6.1.0`; 5.9.3 conflicts with nothing. `@hookform/resolvers` 7.0.3 peers zod
  `^3.25 || ^4` and `zodResolver` validates a zod 4 schema. `strictTypeChecked` flags
  `no-invalid-void-type` on `build.query<T, void>` in the spike's config; the builder checks the
  rule's `allowInGenericTypeArguments` default before adding a `src/services/**` override, and
  never writes `undefined` as the hook's argument type to dodge it.

Rulings from C1 (the scaffold, 2026-11-07):

- **The layout takes the nav table as a prop.** R1.1 forbids `layout/` → `app/`, so
  `app/routes.tsx` renders `<MainLayout nav={NAV} />` and the header reads the prop; the tree's
  comment is amended. The same mechanism as Angular's `NAV_ENTRIES` token.
- **Generated types go through `models/`.** A type import from `services/generated` is allowed
  in `services/`, `store/`, `core/` and `models/` only; a feature, the layout and `shared/` read
  the contract's types from `models/<noun>.ts`, which re-exports them. One place names what the
  UI knows of the contract, as in the Angular template; R1.1's sentence is amended.
- **`no-invalid-void-type` is off for `src/services/**`.** The rule refuses `void` as a call type
  argument whatever `allowInGenericTypeArguments` says, and `build.query<T, void>` is RTK Query's
  documented spelling for an endpoint without an argument.
- **The guards file is a `boundaries/files` category, not an element.** Elements are directories
  (the plugin's single-file mode is deprecated); `core/*` is one element captured by area, and a
  late `allow` lets the `guards` category reach `store/` and `services/`. A violation from
  `guards.ts` therefore carries the core-leaf message.
- **In-place `check` is partial by design.** `tests/e2e/screens.spec.ts` and
  `playwright.config.ts` carry twin marked lines (`// @server:database` and its `@no` form) that
  parse only after generation, so `tsc -b` and `prettier --check .` fail on them in place, as they
  did in 2.x; `bun run test` and `eslint src tests/unit` are the in-place gates, and the generated
  cases run the full `check`.
- **`ApiError.code` is `ErrorCode | 'network'`**, and `requestId` is set whenever an envelope was
  present. The playwright-config test accepts `__PORT__` for the unsubstituted base.

## Versions (registry, 2026-11-07; re-verify at build, never from memory)

| Package | Version | Note |
| --- | --- | --- |
| `react`, `react-dom` | 19.3.0 (registry 19.3.1) | the version `next` pins, so one React runs across the frontends; move both together |
| `react-router` | 8.5.1, pinned exactly | data mode, `lazy` route modules |
| `@reduxjs/toolkit` | 2.14.0 | RTK Query, `createSlice`, `createListenerMiddleware` |
| `react-redux` | 9.3.1 | `withTypes` hooks |
| `radix-ui` | 1.8.1 | the umbrella package, as 2.x |
| `@hey-api/openapi-ts` | 0.99.0, pinned exactly | 0.x; plugins typescript, client-fetch, sdk, zod |
| `zod` | 4.6.7 | |
| `react-hook-form`, `@hookform/resolvers` | 7.91.0, 7.0.3 | S3 checks the resolver against zod 4 |
| `sonner`, `lucide-react`, `clsx` | 2.0.8, 1.70.0, 2.1.1 | |
| `date-fns`, `@date-fns/tz`, `@fontsource-variable/inter` | 4.4.0, 1.5.0, 5.3.0 | |
| `vite`, `@vitejs/plugin-react`, `sass-embedded` | 8.3.6, 6.2.1, 1.108.1 | |
| `typescript` | 5.9.x | typescript-eslint peers `<6.1.0`; `next` is on 5.9; 7.0.2 is out of range |
| `eslint`, `@eslint/js` | 9.39.5 | `jsx-a11y` 6.10.2 peers `^9` only (S3); one ESLint across React and Next |
| `typescript-eslint`, `eslint-plugin-boundaries`, `eslint-import-resolver-typescript` | 8.72.1, 7.4.2, 4.4.5 | the resolver is mandatory |
| `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y` | 7.1.1, 6.10.2 | |
| `vitest`, `jsdom` | 5.1.0, 31.0.0 | |
| `@testing-library/react`, `dom`, `user-event`, `jest-dom` | 16.3.3, 10.4.2, 14.6.8, 7.0.1 | |
| `@playwright/test`, `@axe-core/playwright` | 1.65.0, 4.14.0 | |
| `prettier` | 3.9.10 | |
