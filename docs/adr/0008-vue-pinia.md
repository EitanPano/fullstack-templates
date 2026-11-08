# ADR 0008: The Vue SPA template on Pinia stores, Vue Router and the global SCSS tree

Status: accepted (Eitan, 2026-11-07, "approved" on the session's recap of this design and plan 021:
the Angular tree in Vue's spelling, Pinia setup stores, both flags in 1.0.0, the `useZodForm`
composable for forms; harness plan 021 holds the answers). Catalog release `v1.8.0`,
`frontend/vue` 1.0.0. Harness plan 021. Follows [ADR 0006](0006-per-framework-frontends-and-angular.md)
(per-framework structures, the ten invariants, the Angular tree this one mirrors) and
[ADR 0007](0007-react-redux-rtk-scss.md) (the React tree on Vite, which this one shares its tooling
with). ADR 0006 and ADR 0007 named "ADR 0008" as the Next-on-SCSS follow-up; that ADR was never
written, so this one takes the number and the Next ADR takes the next free one (both references get
an "amended by ADR 0008" line).

## Context

- The catalog ships three frontends: `next` (server-rendered), `react` 3.0.0 and `angular` 1.0.0
  (single-page apps on the global SCSS tree, each with its own layer map, ADR 0006 A1). Vue was out
  of scope of both ADRs and is the one SPA framework the catalog still lacks.
- On 2026-11-07 Eitan asked for the Vue frontend "with Pinia as the store (proper folder file
  structure inspired by the angular app)". The Angular tree (ADR 0006 A2) is therefore the model:
  `app/`, `core/`, `layout/`, `features/<noun>/`, `store/`, `services/`, `shared/`, `models/`, the
  `styles/` tree, the `i18n` and `pwa` flags, the auth glue behind `server:auth`. Where Vue has an
  idiom of its own (single-file components, composables, Pinia setup stores, Vue Router's route
  guards, Vite) the tree follows the idiom; every such reconciliation is marked ▲ and explained.
- The tooling is React 3.0.0's: Vite 8, Vitest, Playwright behind `vite preview`, the Bun-built
  Docker image, nginx with `assets/` immutable, `tests/unit/` for the tooling checks. Nothing in the
  generator changes: `.vue` is already a marker type (HTML comment syntax) and the app smoke reads
  any hashed module script (ADR 0006 R40).
- The dev loop, QA, the screens checks and the brand generator consume only the ten invariants of
  `docs/conventions.md › Frontend`, so a fourth vocabulary costs the harness one wording pass
  (T11), as the Angular and React ones did.

## Decisions

Each decision lists what it costs. Rows marked ▲ are reconciliations of the Angular tree with Vue's
idioms or with the catalog's invariants, explained under the tree.

### T1. The tree

`frontend/vue` 1.0.0: Vite 8, Vue 3.5 (`<script setup lang="ts">`, Composition API only), Vue
Router 5 with explicit route tables, Pinia 4 setup stores, Hey API's fetch client with the flat SDK
and zod schemas, Reka UI primitives styled by the global SCSS tree, vue-i18n, `vite-plugin-pwa`
behind the `pwa` flag.

```
src/
├── main.ts                           # imports brand.css then styles.scss; createApp(App); installPlugins(app); app.mount('#app'); vite:preloadError → reload
├── vite-env.d.ts
├── app/                              # the wiring; no product logic, no fetch
│   ├── App.vue                       # <RouterView />, nothing else ▲ (the shell and the toast host are layout/)
│   ├── plugins.ts                    # installPlugins(app): pinia, router, i18n, the interceptors (http.provider), the initializers,
│   │                                 #   the ROLES_KEY provide (@server:auth), the PWA registration (@pwa)
│   ├── routes.ts                     # the route table: main-layout with props { nav } ▲, one lazy routes file per feature, catch-all → not-found;
│   │                                 #   auth-layout and its routes (@server:auth)
│   ├── router.ts                     # createRouter(createWebHistory(), routes); afterEach sets document.title from meta.titleKey
│   └── nav.ts                        # the one nav table: NavEntry { path, labelKey, roles? } (NavEntry lives in models/nav/)
├── core/                             # singletons wired once in app/plugins.ts; never imported by shared/
│   ├── config/
│   │   ├── env.ts                    # the only reader of import.meta.env (zod); VITE_* values are public
│   │   ├── api-client.ts             # the generator's runtimeConfigPath: origin, credentials same-origin, throwOnError,
│   │   │                             #   fetch: withLoading(withRefresh(globalThis.fetch)) ▲ (withRefresh @server:auth); type imports otherwise
│   │   └── constants.ts              # STORAGE_KEYS; LOGIN_PATH, FORBIDDEN_PATH (@server:auth)
│   ├── interceptors/
│   │   ├── auth.interceptor.ts       # withRefresh(fetch): own /api only, 401 → one shared refresh → one retry; a refused refresh clears the
│   │   │                             #   hint and emits sessionLost ▲ (@server:auth)
│   │   ├── loading.interceptor.ts    # withLoading(fetch): the loading store's count up before the send, down in finally ▲ (one exchange, once)
│   │   ├── error.interceptor.ts      # client.interceptors.error: the envelope → ApiError, a thrown fetch → ApiError network; no toast (invariant 3)
│   │   └── http.provider.ts          # installInterceptors(): registers the error interceptor on the generated client (the one runtime
│   │                                 #   import of services/generated outside services/, as Angular's api-client.provider.ts)
│   ├── guards/
│   │   ├── auth.guard.ts             # beforeEnter: awaits the session restore, a visitor → /auth/login?next= (@server:auth)
│   │   ├── role.guard.ts             # meta.roles vs authStore.roles → /forbidden (@server:auth)
│   │   ├── guest.guard.ts            # login and register: an account goes home (@server:auth)
│   │   └── unsaved-changes.guard.ts  # useUnsavedChangesGuard(hasChanges): onBeforeRouteLeave + the confirm dialog
│   ├── providers/                    # ▲ platform wrappers with no reactive state of their own (the stateful services are stores)
│   │   ├── storage.ts                # safe local storage; never a token
│   │   ├── logger.ts                 # strips tokens, passwords, PII
│   │   ├── theme.ts                  # toTheme, readStoredTheme, resolveTheme (matchMedia), applyTheme (data-theme, resolved), watchSystemTheme
│   │   └── session.ts                # the session hint (set, clear, has) and onSessionLost(listener) / emitSessionLost() (@server:auth)
│   ├── i18n/
│   │   ├── i18n.ts                   # createI18n({ legacy: false, locale 'en', fallback 'en', messages { en } }); he lazy-loaded (@i18n) ▲
│   │   ├── languages.ts              # [{ code, dir, locale }] (@i18n)
│   │   ├── missing-key.handler.ts    # dev-only console warning for a missing key
│   │   └── translations/
│   │       ├── en.json               # the copy table; base in both modes
│   │       └── he.json               # (@i18n) same keys, a unit test asserts parity
│   ├── errors/
│   │   └── global-error-handler.ts   # app.config.errorHandler and unhandledrejection → logger + one errors.unexpected toast
│   └── initializers/
│       ├── session.initializer.ts    # starts authStore.restoreSession() at boot (5 s cap, never awaited by mount ▲); the sessionLost reaction (@server:auth)
│       ├── i18n.initializer.ts       # the saved or browser language before first render; <html lang dir> (@i18n)
│       └── pwa.initializer.ts        # registerSW (prompt), update checks at start, hourly and on focus, the install listener (@pwa)
├── layout/
│   ├── main-layout/main-layout.vue   # skip link, <AppHeader>, <SideNav>, <main id="main"><RouterView /></main>, <AppFooter>, <ToastHost>
│   ├── auth-layout/auth-layout.vue   # centred <main id="main">, the product name, no shell (@server:auth)
│   └── components/
│       ├── app-header.vue            # name → '/', language toggle (@i18n), theme toggle, install (@pwa), offline badge, account slot, nav toggle on phones
│       ├── side-nav.vue              # <nav aria-label="Primary"> from the nav prop filtered by role; a drawer below lg (Reka Dialog)
│       ├── app-footer.vue
│       ├── toast-host.vue            # renders the notification store's list through Reka Toast
│       ├── slots.ts                  # ▲ the one file the generator resolves: accountSlot(), languageToggle(), installButton() each return a
│       │                             #   component on a marked line or null (two returns, as React's account-slot.tsx)
│       ├── account-menu.vue          # avatar, email, profile, sign out; no theme control (@server:auth)
│       ├── language-toggle.vue       # (@i18n)
│       └── install-button.vue        # (@pwa)
├── features/                         # one directory per server module or screen group ▲; a feature never imports another
│   ├── health/
│   │   ├── health.routes.ts          # export default [{ path: '', component: () => import('./pages/health-status-page.vue'), meta: { titleKey } }]
│   │   ├── pages/health-status-page.vue      # the home screen: reads the store; skeleton, error-state with retry, the loaded view
│   │   └── components/health-badge.vue       # presentational: props in, a model table, no store
│   ├── auth/                         # (@server:auth)
│   │   ├── auth.routes.ts            # login and register behind guestGuard; verify-otp behind authGuard
│   │   ├── auth.form.ts              # loginForm(), registerForm() (match confirm), otpForm(): useZodForm over the generated zod request schemas
│   │   └── pages/{login,register,verify-otp}-page.vue
│   ├── user/                         # (@server:auth) user.routes.ts (authGuard), user.form.ts, pages/profile-page.vue
│   ├── forbidden/                    # (@server:auth) forbidden.routes.ts, pages/forbidden-page.vue: roleGuard's target
│   └── not-found/                    # not-found.routes.ts ('/:pathMatch(.*)*' inside the main layout), pages/not-found-page.vue
├── store/                            # ▲ every Pinia store: the domain stores and the app-state stores
│   ├── request-status.ts             # useRequestStatus(): status, error, loading/loaded/failed, setLoading/setLoaded/setError
│   ├── health.store.ts               # the live example
│   ├── auth.store.ts                 # user, isLoggedIn, roles, restoring, ready; restoreSession, login, register, logout, requestOtp, verifyOtp (@server:auth)
│   ├── user.store.ts                 # the account's data; reset() on sign-out (@server:auth)
│   ├── theme.store.ts                # choice light | dark | system → applyTheme; follows the OS while system
│   ├── notification.store.ts         # the toast list: showError / showInfo / showWarning(key, params?, action?)
│   ├── network.store.ts              # online (window events); stores refuse mutations offline
│   ├── loading.store.ts              # the in-flight count the loading interceptor drives
│   ├── language.store.ts             # lang; <html lang dir>; the saved choice; loads he on demand (@i18n)
│   ├── app-update.store.ts           # needRefresh / updateServiceWorker; toast → activate and reload (@pwa)
│   └── install-prompt.store.ts       # beforeinstallprompt; canInstall + promptInstall(); the dismissable iOS hint (@pwa)
├── services/                         # the data layer: the only directory that imports the generated runtime (plus http.provider.ts)
│   ├── generated/                    # Hey API output: types, the fetch client, the flat SDK, zod. Committed, never edited, ignored by lint and Prettier
│   ├── health.service.ts             # a facade over the SDK, one per server module: `const { data } = await getApiHealth(); return data`
│   ├── auth.service.ts               # (@server:auth)
│   └── user.service.ts               # (@server:auth)
├── shared/                           # product-agnostic; imports shared/ and models/ only
│   ├── components/                   # app-button, app-icon, form-field, app-input, app-select, app-textarea, app-checkbox, form-actions,
│   │                                 #   page-header, data-table, app-modal + confirm-dialog (Reka Dialog), app-toast (Reka Toast),
│   │                                 #   empty-state, error-state, app-skeleton, app-spinner, auth-card (@server:auth); the ui-design rubric's names
│   ├── directives/                   # autofocus.ts (v-autofocus), has-role.ts (createHasRoleDirective(roles) and ROLES_KEY ▲; @server:auth)
│   ├── composables/                  # use-media-query.ts, use-unique-id.ts (pure Vue, no store)
│   ├── validators/                   # zod-form.ts (useZodForm ▲), match.ts, server-errors.ts (applyFieldErrors)
│   └── utils/                        # time.ts, relative-time.ts, phone.ts (the Angular pipes as functions ▲), next-path.ts (@server:auth)
├── models/
│   ├── api/{response,error-copy}.ts  # ApiError (a plain object), isApiError, toApiError, Paginated<T>; errorMessageKey(code)
│   ├── health/                       # interface.ts (import type re-exports), constants.ts
│   ├── nav/interface.ts
│   ├── notification/interface.ts
│   └── user/{interface,constants}.ts # (@server:auth)
├── testing/                          # imported only by *.spec.ts: render.ts (the plugins: i18n from memory, pinia, a memory router, the directives),
│                                     #   stub-api.ts (fetch by `METHOD /path`), auth-fixtures.ts (@server:auth)
└── styles/                           # the only home of CSS: no <style> block, no style attribute, no stylesheet import outside main.ts
    ├── styles.scss                   # @use setup → themes → basics → components → views
    ├── setup/{_variables,_breakpoints,_functions,_mixins,_typography}.scss
    ├── themes/{brand.css,_index,_light,_dark}.scss   # brand.css holds the generator's token blocks (plain CSS, ADR 0006 S3 fallback)
    ├── basics/{_helpers,_base,_layout}.scss
    ├── components/_index.scss + one partial per shared and layout component
    └── views/_index.scss + {_health-status,_login,_register,_verify-otp,_profile,_forbidden,_not-found}.scss

public/
├── theme-init.js                     # sets data-theme (resolved) before first paint; a file, never inline (CSP script-src 'self')
├── favicon.ico
└── icons/                            # (@pwa) icon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png

tests/
├── e2e/{shell,screens,smoke,auth}.spec.ts, screen-routes.ts (AUTH_ROUTES, SIGNED_IN_ROUTES, capturedRoutes), support.ts, auth-support.ts
└── unit/                             # tooling checks: eslint-boundaries, styles-tree, density, playwright-config, e2e-database-url (@server:database),
                                      #   screen-routes, translation-parity (@i18n), main-imports
scripts/e2e-database-url.ts
index.html (div#app, data-density, theme-color light and dark, noscript), vite.config.ts (vue(), the @ alias, the /api proxy, scss loadPaths,
the i18n plugin, VitePWA behind // @pwa lines and the manifest), vitest.config.mts, vitest.setup.ts, tsconfig*.json, eslint.config.mjs,
openapi-ts.config.ts, playwright.config.ts, package.json, bun.lock, Dockerfile, nginx/{default.conf,security-headers.conf}, .dockerignore,
.prettierrc, .prettierignore, .env.example
```

The reconciliations, each with its reason:

- **`App.vue` renders the router only.** The shell (skip link, header, side-nav, `main`, footer) is
  `layout/main-layout`, the parent route component of every feature route, as Angular's
  `MainLayoutComponent`; the toast host sits inside it so the layout reads the notification store
  and `shared/components/app-toast` stays presentational.
- **The layout takes the nav table as a route prop.** `layout/` may not import `app/`, so
  `app/routes.ts` gives the main-layout route `props: { nav: NAV }` and the header and side-nav read
  the prop. The same cut as Angular's `NAV_ENTRIES` token and React's `nav` prop;
  `tests/e2e/screen-routes.ts` still reads `app/nav.ts`.
- **Every Pinia store lives in `store/`.** Angular keeps its stateful singletons (theme,
  notification, network, loading, install prompt, app update) in `core/providers/` as injectables.
  In Vue the one reactive-state mechanism is Pinia, and a second home for stores would make an agent
  guess; so `store/` holds the domain stores (one per server module: `health`, `auth`, `user`) and
  the app-state stores (`theme`, `notification`, `network`, `loading`, and with the flags
  `language`, `app-update`, `install-prompt`), each a setup store (`defineStore(name, () => {...})`).
  `core/providers/` keeps what has no reactive state: the storage and logger wrappers, the theme DOM
  helpers and the session hint. Cost: `store/` mixes nouns with app state; the agents file says
  which is which, and the import rule is the same for both.
- **`useRequestStatus()` is `with-request-status`.** A composable returning the `status` and
  `error` refs, the `loading`, `loaded` and `failed` computeds and the three setters; a store
  spreads its state into its return. A store with two independent requests calls it twice.
- **The auth interceptor is the fetch wrapper, and it never imports the store.** The generated
  client imports `core/config/api-client.ts` at module load; a store imports a facade, which
  imports the client. If the interceptor imported the auth store the graph would be a cycle, so,
  as React's `api-client.ts`, the wrapper does the refresh itself with `globalThis.fetch` (one
  in-flight promise shared by concurrent 401s, the exempt auth paths by URL, own origin and `/api`
  only), reads and clears the hint through `core/providers/session.ts`, and on a refused refresh
  (400, 401, 403) emits `sessionLost`. `core/initializers/session.initializer.ts` subscribes once:
  `authStore.forget()` and `router.push(toLogin(current))`, unless the store is restoring, the
  current route is a login URL, or the failure was a network error or 5xx (Angular's rules). The
  store's `refresh()` method is therefore gone; the store exposes `restoreSession`, `login`,
  `register`, `logout`, `requestOtp`, `verifyOtp`, `forget` and `ready`.
- **The session restore never blocks the mount.** Angular's app initializer runs before the first
  route; React found that holding the shell on the session read broke the skip link's first Tab.
  Here `main.ts` mounts at once, the initializer starts `restoreSession()` with the 5 s cap, and
  `authGuard`, `roleGuard` and `guestGuard` `await authStore.ready` (a promise that settles when
  the restore settles or times out) before deciding. A public page renders immediately; a guarded
  deep link waits for the answer. With no hint `restoreSession()` returns at once and `ready` is
  already settled, so a visitor never waits. When the cap fires first, the app is a visitor for
  good: a late answer is discarded (the store stays signed out, the hint stays, the timeout is
  logged once), a guarded deep link lands on login with `next`, and the visitor signs in again or
  reloads, Angular's rule; nothing re-navigates behind the user's back.
- **Two fetch wrappers and one Hey API interceptor.** `loading.interceptor.ts` exports
  `withLoading(fetch)`: the loading store's count goes up before the send and down in a `finally`,
  so one exchange counts once whatever happens (a thrown `fetch`, an early throw, a replay).
  `auth.interceptor.ts` exports `withRefresh(fetch)` (next bullet). `core/config/api-client.ts`
  composes them, loading outermost (`withLoading(withRefresh(globalThis.fetch))`), Angular's order,
  so the refresh and its retry inside count as the one exchange. `error.interceptor.ts` is a
  `client.interceptors.error` function registered by `http.provider.ts` from `app/plugins.ts`: it
  turns the envelope (status, `code`, `requestId`, `details`) into an `ApiError`, and a thrown
  `fetch` (no response) into `ApiError` `network`; the generated client runs its error interceptors
  for both (its whole request path sits in one `try`; read at 0.99.0) and under `throwOnError: true`
  throws the interceptor's return value, so a facade call rejects with the `ApiError`.
  `toApiError(cause)` in the awaiting store method stays the belt for anything else (`unknown`,
  logged). Spike S1 re-proves the three claims in a generated tree.
- **vue-i18n is the translator in both modes.** Angular needed a `Translator` indirection because
  Transloco is removed when `i18n` is off. vue-i18n's runtime-only build is small and is the
  idiomatic `t`, so it stays installed in both modes: `core/i18n/i18n.ts` creates it with `en`
  bundled, and the flag adds `he.json`, `languages.ts`, the language store and initializer, the
  toggle, the RTL check and the parity test. No `dependencies.remove`, no second `t`. Cost: one
  dependency a flag-off project does not use for switching.
- **The `pwa` flag removes everything.** The manifest is configuration in `vite.config.ts`, which
  takes `// @pwa` markers, so `pwa=false` drops the plugin lines, `dependencies.remove` drops
  `vite-plugin-pwa` and `workbox-window`, and the build emits no worker. The limitation Angular
  accepted (`angular.json` is JSON) does not apply.
- **A `.vue` file carries template block markers only.** The generator reads `.vue` with the HTML
  comment syntax, so `<!-- @i18n-start -->` … `<!-- @i18n-end -->` blocks on lines of their own
  work inside `<template>`, as the Angular templates use them; a trailing `<!-- @x -->` is never
  written in a `.vue` file, because Prettier may move the comment when it wraps the tag and a
  moved marker drops nothing (the Angular `.html` templates use blocks for the same reason). A
  `// @word` line inside `<script setup>` is not applied and fails generation as a leftover. So no
  `.vue` file imports a file that exists only with a flag or selection: the header composes
  `account-menu`, `language-toggle` and `install-button` through `layout/components/slots.ts`, a
  `.ts` file whose three functions each return the component on a marked line or `null` on its
  `@no` twin (two returns, `no-unreachable` off for the file, as React's `account-slot.tsx`);
  `app/routes.ts` and `app/plugins.ts` are `.ts`. Spike S6 proves the block form through Prettier
  and the generator; the fallback is a tool change that lets `.vue` take `//` markers inside its
  script block.
- **Forms are a composable over the generated zod schemas** (T4): `shared/validators/zod-form.ts`
  exports `useZodForm(schema, initial)`; `features/<f>/<f>.form.ts` builds one form per function,
  as Angular's `auth.form.ts`. vee-validate 4's zod adapter peers zod 3 only and vee-validate 5 is
  a beta; TanStack Vue Form is the recorded fallback.
- **Pipes become functions.** Vue has no pipes: `relativeTime(iso, lang)`, `formatPhone(e164)` and
  `time.ts` are pure functions in `shared/utils/`, called in templates; `t` is vue-i18n's.
- **`v-has-role` is built per app.** `shared/` never imports `store/`, and a directive hook has
  no setup context (it cannot `inject()`), so `shared/directives/has-role.ts` exports
  `createHasRoleDirective(roles: Readonly<Ref<readonly string[]>>)` and the injection key
  `ROLES_KEY` for components. `app/plugins.ts` makes one `roles` ref from the auth store behind
  `// @server:auth` (an empty ref on the `@noserver:auth` line), registers
  `app.directive('has-role', createHasRoleDirective(roles))` and provides `ROLES_KEY` from the same
  ref; the side-nav's role filter injects the key, so it needs no marker. The same mechanism as
  Angular's `ROLES` token, in two halves.
- **`features/<module>` mirrors the server's modules** (`health`, `auth`, `user`) plus the screen
  groups (`forbidden`, `not-found`), as Angular's and React's. A feature's routes file is a default
  export of `RouteRecordRaw[]`; `app/routes.ts` composes them with dynamic imports so every page is
  its own chunk.
- **Files are kebab-case, tags PascalCase.** `health-status-page.vue` renders as `<HealthStatusPage>`;
  `vue/component-name-in-template-casing` enforces PascalCase in templates and
  `vue/multi-word-component-names` the two-word rule, so a one-word control carries the `App`
  prefix (`app-button.vue`, `<AppButton>`), Angular's `app-` selector in Vue's spelling. Suffixes
  follow the Angular tree where a file is not a component: `*.store.ts`, `*.service.ts`,
  `*.guard.ts`, `*.interceptor.ts`, `*.routes.ts`, `*.form.ts`, `*.initializer.ts`; directives and
  composables are `kebab.ts` and `use-kebab.ts`. Cross-layer imports use the `@/*` alias; imports
  inside one feature stay relative.
- **Co-located `*.spec.ts`** beside the file (Vue's and Vitest's convention, and Angular's
  suffix); `tests/unit/` keeps the checks on files outside `src/`. `src/testing/` holds the helpers
  the specs import, as React's.
- **No `environments/`.** Vite's `import.meta.env` is read once in `core/config/env.ts` (React's
  rule); `production` is `env.MODE`.
- **Nothing beyond the Angular screens.** The health screen, the auth screens, the profile,
  forbidden and not-found; no data table page, no file upload service (Angular's `file-upload`
  needs `HttpClient`'s progress events; a Vue one would be XHR and is a backlog line).

#### T1.1 Layers and import rules

`eslint-plugin-boundaries` element types and what each may import. A feature never imports another
feature; `shared/` never imports `core/`, `store/` or `services/`. Every message names the layer to
use instead; `tests/unit/eslint-boundaries.spec.ts` lints one violation and one allowed case per row.

| From | May import |
| --- | --- |
| `app/` (`App.vue`, `plugins.ts`, `routes.ts`, `router.ts`, `nav.ts`) | layout, features (`*.routes.ts` only), core, store, shared, models |
| `main.ts` (the `entry` category) | app, core, shared, models |
| `layout/` | `core/config`, `core/providers`, store, shared, models |
| `features/<f>/pages/` | store, shared, models, `core/config`, `core/providers`, `core/guards` (the unsaved-changes composable), its own feature's `components/` and `*.form.ts` |
| `features/<f>/components/` | shared, models |
| `features/<f>/*.routes.ts` | `core/guards`, its own pages |
| `features/<f>/*.form.ts` | `shared/validators`, models, the generated zod schemas (`@/services/generated/zod.gen`) |
| `store/` | store, services, models, `core/providers`, `core/config` |
| `services/` | models, `core/config`, `services/generated` |
| `core/guards`, `core/initializers`, `core/interceptors/error.interceptor.ts`, `core/interceptors/http.provider.ts` | store, services (`http.provider.ts` alone: the generated client runtime), core, shared, models (the wiring) |
| `core/interceptors/loading.interceptor.ts` (the `fetch-wrapper` category) | `store/loading.store.ts`, `core/config`, `core/providers`, models (the client config imports it; the loading store imports nothing of the data layer, so no cycle) |
| `core/interceptors/auth.interceptor.ts` (the `fetch-wrapper` category) | `core/config`, `core/providers`, models (a leaf: never `store/` or `services/`, by `no-restricted-imports`) |
| `core/config`, `core/providers`, `core/i18n`, `core/errors` | each other, shared, models; `core/config/api-client.ts` alone also the two fetch wrappers |
| `shared/` | shared, models |
| `models/` | models; the generated types and zod schemas, `import type` only |
| `testing/` | anything; nothing outside `*.spec.ts` imports it |

Also lint-enforced: the generated runtime (`client.gen`, `sdk.gen`, the barrel) is imported only in
`services/` and `core/interceptors/http.provider.ts`; `zod.gen` is the one generated runtime file a
`features/<f>/*.form.ts` may also import (a form schema extends the generated request schema,
invariant 1); the generated types reach `services/`, `store/`, `core/` and `models/` with
`import type` (every other layer reads the contract's types through `models/<noun>/`); `fetch(`
(the global) only in `core/interceptors/auth.interceptor.ts`; `import.meta` only in
`core/config/env.ts`; `<button>`,
`<input>`, `<select>` and `<textarea>` only inside `shared/components/`
(`vue/no-restricted-html-elements`, off for that directory); no `<style>` block in any component
(`vue/no-restricted-block`), no `style` attribute (`vue/no-static-inline-styles` and the
`styles-tree` scan for bound ones), no `.css` or `.scss` import outside `main.ts`; a file in a
directory no layer claims is an error (`boundaries/no-unknown-files`); `eslint-import-resolver-typescript`
reads the `@/*` alias from `tsconfig.app.json` and resolves `.vue` imports (without it a violation
is silently missed, ADR 0006 S2).

Why: the Angular rules ("pages read stores, never services"; "shared never imports core") hold
unchanged; the `fetch-wrapper` category cuts the cycle `client → config → interceptor → store`.
`tests/` sits outside the layers (boundaries-ignored), so `tests/e2e/screen-routes.ts` reads
`src/app/nav.ts` as the React and Angular ones do.

Cost: a page that wants a one-off request has to add a facade method and a store method first.
That is the point.

### T2. Data flow

Page → store → service → generated SDK → the fetch client (the interceptors), as Angular's.

- A store method is `setLoading()`, `await` the facade, patch the refs, `setLoaded()`; in the
  `catch` it `setError(toApiError(cause, context))` and toasts `errorMessageKey(error.code)` once
  through the notification store; a cause that is not an `ApiError` is logged first and shown as
  `errors.unknown`, so a bug is never silent. A method behind a form returns whether it worked and
  leaves `validation_failed` in `error` for the page to put on its fields.
- Reads refresh by method call; there is no query cache layer. A mutation reloads through the
  store's own method. A store refuses a mutation while `network.online` is false and toasts
  `errors.offline`.
- A store that holds an account's data (`user.store.ts`) exposes `reset()` and watches
  `auth.isLoggedIn` to clear itself; `load()` drops the old value before it calls and ignores an
  answer that arrives after sign-out.
- A page reads the store through `storeToRefs` and calls its methods; a component takes props.

Why: Eitan asked for Pinia stores; one state model per app is easier for an agent than a store
beside a query cache. Cost: no request deduplication or background refetch for free. A product that
needs them adds Pinia Colada by plan (Hey API has a `@pinia/colada` plugin); until then the facades
are the one call site.

### T3. Store

Pinia 4 setup stores, one file per store in `store/`, named `use<Noun>Store`, `defineStore('<noun>', () => ...)`.
`main.ts` installs the one Pinia; a spec calls `setActivePinia(createPinia())` or renders with
`createTestingPinia`. State is refs and computeds; a watcher inside the store is its side effect
(the theme store applies `data-theme`; the user store resets on sign-out). No option stores, no
`mapState`, no Vuex. `app/plugins.ts` installs Pinia before the router so a guard may read a store.

Cost: a setup store's return must list every ref a page reads; a forgotten one is a silent
`undefined`, which the store's spec catches.

### T4. Forms

`useZodForm(schema, initial)` in `shared/validators/zod-form.ts`: a reactive `values` object, the
issues of the generated zod request schema mapped by path to `{ messageKey, params }` with the
Angular copy keys (`errors.required|email|minlength|maxlength|min|max|pattern|invalid`), a touched
set, `submitted`, `submit(handler)` that validates and calls the handler with the parsed value, and
`applyFieldErrors(error)` (`shared/validators/server-errors.ts`) that writes a `validation_failed`
envelope's paths onto the fields and returns the paths no field has, for the page to toast once.
`features/<f>/<f>.form.ts` exports one function per form over the generated schema (`zCredentials`,
`zOtpVerificationBody.pick({ code: true })`), never copying a limit; `match('password', 'confirm')`
is the one other validator. `shared/components/form-field.vue` wraps a control: it provides the
field's id, the first error once the control is touched or the form was submitted, `aria-invalid`
and `aria-describedby` through a `FORM_FIELD` injection the control components read; the control
components bind with `v-model`; `form-actions.vue` is the submit row.

Why: vee-validate 4.15's `@vee-validate/zod` peers zod 3 only and vee-validate 5 is a beta; the
template already owns the issue-to-copy mapping and the server-error path logic in Angular, and the
composable is the same ~150 lines in Vue with no adapter. Cost: a form library the agent did not
learn elsewhere; the agents file documents it in the recipe. Fallback (spike S2): `@tanstack/vue-form`
1.33 with the generated schema as a Standard Schema validator and the same `form-field`.

### T5. Styling

The React and Angular rule, unchanged: `src/styles/` is the only home of CSS; `main.ts` imports
`themes/brand.css` then `styles.scss`; components render BEM classes and carry no `<style>` block
and no `style` attribute. The generated token blocks sit in `themes/brand.css` under `:root` and
`[data-theme='dark']` (plain CSS, Prettier-ignored); `_light.scss` and `_dark.scss` hold the
product's tokens beyond the generated set; `setup/_typography.scss` takes `__THEME_FONT_STACK__`;
`index.html` takes `data-density="__THEME_DENSITY__"` and `__PROJECT_DISPLAY_NAME__`. Breakpoints
`sm` 576, `md` 768, `lg` 1024, `xl` 1280, `xxl` 1536, mobile first, logical properties (RTL under
`dir="rtl"`), the 4 px scale through `space()`, controls 36 px on a fine pointer, 32 px under
`[data-density='compact']`, 44 px on `(pointer: coarse)` whatever the density (`touch-target`
last); `tests/unit/density.spec.ts` compiles the tree and asserts the three numbers. The theme
toggle is in the header for everyone (Angular's ruling); the user menu holds avatar, email, profile
and sign out. The side-nav is a drawer below `lg` on Reka's Dialog (focus trap, Escape, focus
return); Reka hides the rest with `aria-hidden`, and the layout also sets `inert` on the shell
content while the drawer is open (`:inert="drawerOpen"`), as Angular's CDK drawer did; inline
from `lg`.

Primitives are Reka UI (`reka-ui`, the Radix Vue successor): Dialog (modal, confirm, the drawer),
DropdownMenu (the account menu), Tooltip, Toast (the notification list), Checkbox, Select, Switch,
Tabs, Avatar, Separator, Label, VisuallyHidden; `data-state` and `data-side` are the styling
hooks. One icon set (`lucide-vue-next`, `aria-hidden` next to a label) and one toast
implementation (Reka Toast rendered by `layout/components/toast-host.vue` from the notification
store; a toast may carry one action, as Angular's). The pattern components keep the `ui-design`
rubric's names: `page-header`, `empty-state`, `error-state`, `app-skeleton`, `form-field`,
`form-actions`, `confirm-dialog`, `data-table`, `auth-card`. No scaffolder. Copy: every string in a
template goes through `$t('key')` (or `t` from `useI18n()` in script) with its key in `en.json`,
nested by area, `{param}` for values; a component input that carries text takes an already
translated string, and an input named `...Key` takes a key.

### T6. Auth

The server sets HttpOnly cookies; the page never reads a token. Invariant 7, in Vue's terms:

- **Refresh.** `auth.interceptor.ts` (T1's reconciliation): own origin and `/api` only, a 401 from
  any endpoint but the exempt five becomes one `POST /api/auth/refresh` and one retry; concurrent
  401s share the one refresh; a 400, 401 or 403 from the refresh clears the hint and emits
  `sessionLost`; a 429, 5xx or network failure does not. Sign-out is not exempt.
- **The session hint** is `core/providers/session.ts`: `'1'` under `STORAGE_KEYS.session`, set by
  the auth store after `login` and `register`, cleared on `logout` and by a refused refresh. Nothing
  else reads it.
- **Restore.** `restoreSession()` reads `GET /api/user/me` once when the hint is set (`restoring`
  true meanwhile), fails closed to a visitor on any failure (logged unless it is the 401), never
  clears the hint itself; `ready` resolves either way, or after 5 s, and an answer that arrives
  after the cap is discarded (T1's reconciliation).
- **Guards** in `core/guards/`: `authGuard` (`beforeEnter`: a visitor → `/auth/login?next=<path and query>`,
  through `toLogin`), `roleGuard` (`meta.roles` against `authStore.roles` → `/forbidden`),
  `guestGuard` (an account on login or register → home). A feature's routes file puts them on the
  route. The role is the API's answer; a guard only keeps a visitor off a screen; the API checks
  every call. The login page reads `next` through `safeNextPath` (only a path on this site).
- **Sign-in, sign-up, OTP, profile**: Angular's pages and flows (`register` → `verify-otp` as a
  verification step behind `authGuard`; the profile carries the phone update over the generated
  schema widened to accept `''`). Sign-out calls the API (a 401 still signs out), clears the hint,
  resets the user store through the watcher, navigates home.
- **The account slot**: `account-menu.vue` with avatar (initials as CSS content from
  `data-initials`, so the accessible name is the label alone), email, profile, sign out;
  `/forbidden` is a feature. Renaming the roles edits `models/user/constants.ts`, every
  `meta.roles`, the specs and the agents file, after the server and `contract`.

### T7. The flags

| Flag | Default | On | Off |
| --- | --- | --- | --- |
| `i18n` | true | `he.json`, `languages.ts`, `language.store.ts`, `i18n.initializer.ts`, `language-toggle.vue`, `<html lang dir>`, the parity test, the `@i18n` lines (the toggle slot, the `he` loader) | the files under `onlyPaths` gone, the lines marked out; vue-i18n stays with `en` bundled (no `dependencies.remove`) |
| `pwa` | true | `vite-plugin-pwa` (`registerType: 'prompt'`, the manifest in `vite.config.ts`, workbox: shell precompiled, `navigateFallbackDenylist: [/^\/api\//]`, one `NetworkFirst` runtime rule for `/api/health` only, never `/api/user/**` or `/api/auth/**`), `public/icons/`, `pwa.initializer.ts`, `app-update.store.ts` (`useRegisterSW` from `virtual:pwa-register/vue`: `needRefresh` → an info toast whose action activates and reloads), `install-prompt.store.ts` (`beforeinstallprompt`, the dismissable iOS hint), `install-button.vue`, the `@pwa` lines | the files gone, the plugin lines and `@pwa` lines marked out, `dependencies.remove: ['vite-plugin-pwa', 'workbox-window']`; the build emits no worker, no manifest |

Copy tables are precompiled by `@intlify/unplugin-vue-i18n`, so the production bundle is the
runtime-only build and runs under `script-src 'self'` (spike S3 proves no `unsafe-eval`). The
manifest's `theme_color` and `background_color` are `#ffffff` (no hex placeholder exists); a project
changes them with its icons. A frontend manifest cannot declare `auth`; the account screens follow
the server's flag through `onlyWhen: { "server:auth": [...] }` and the markers, as `react` and
`angular` do.

### T8. Tests and e2e

Unit: Vitest, jsdom, `@testing-library/vue` with `@testing-library/user-event`, `@pinia/testing`.
Components: props in, roles and text out. The API is the one boundary: `stubApi`
(`src/testing/stub-api.ts`, React's) stubs the global `fetch` by `METHOD /path`, so a facade or a
store spec goes through the real generated client, the interceptors and the copy tables. A page is
rendered with `src/testing/render.ts` (i18n with `en.json` from memory, a testing Pinia with
`stubActions: false` or an initial state, a memory-history router, the directives). The template
tests its own glue once: `useRequestStatus`, each facade and the error interceptor (the envelope,
a 5xx, a network failure), the loading count, the refresh collapse (two concurrent 401s, one
refresh; the hint cleared on 400/401/403 and kept on 429/5xx/network; `sessionLost` emitted once),
the guards (visitor, wrong role, signed-in on login, the `ready` wait and its timeout), the auth
and user stores, the theme, network, notification and loading stores, `useZodForm` and
`applyFieldErrors`, each form's success and failure, `form-field`'s aria wiring, the shell nav and
the drawer, the account menu's states, `v-has-role`, the language store and the parity test
(`@i18n`), the update and install stores with the SW API mocked (`@pwa`), `safeNextPath`, the
format helpers, and the tooling checks in `tests/unit/`.

E2E: React 3.0.0's set, with Angular's additions. `playwright.config.ts` keeps `phone` and
`desktop`, `E2E_BASE_URL`, `reuseExistingServer: false`, `retries: 0`, `vite build && vite
preview`, the `e2eDb && start` chain, `RATE_LIMIT_SCALE=100`, and `serviceWorkers: 'block'` (a
registered worker never serves a stale shell to a test). `shell.spec` asserts the landmarks, the
skip link, no overflow, the 44 px targets on `@phone` (also with `data-density="compact"`), the 36
and 32 px densities on `@desktop`, the theme switch through `data-theme`, the drawer's focus trap
and, behind `@i18n` markers, the language toggle flipping `dir`. `screens.spec` captures every nav
route plus `AUTH_ROUTES` in both themes with axe WCAG A and AA, no horizontal scroll and one `h1`;
`SIGNED_IN_ROUTES` (`/profile`, `/auth/verify-otp`) after `registerThroughApi`. `smoke.spec` reads
the health status. `auth.spec`: sign-up, sign-in, profile, sign-out, a wrong password, a taken email
on its field, the guarded redirect with `next`, two concurrent 401s sharing one refresh (by route
interception on `/api/health`, Angular's way). The theme for a screen is forced through the `theme`
key in `localStorage` before load.

### T9. Build and tooling

- `package.json` scripts as React's: `dev` (`vite`), `build` (`vite build`), `preview`, `typecheck`
  (`vue-tsc -b`: it type-checks `.vue` templates; `tsc` does not), `lint` (`eslint .`), `format`
  and `format:check` (Prettier, which parses `.vue`), `test` (`vitest run`), `test:watch`,
  `test:e2e`, `api:types` (`openapi-ts`), `check` (typecheck, lint, format check, test).
- `openapi-ts.config.ts`: `input: ../__SERVER_DIR__/openapi.json`, `output.path:
  'src/services/generated'`, plugins `@hey-api/typescript`, `@hey-api/client-fetch` with
  `runtimeConfigPath: './src/core/config/api-client.ts'`, `@hey-api/sdk` (flat), `zod`. No
  `@pinia/colada` plugin (T2). The committed output is generated from `server/python-fastapi`'s
  committed contract (ADR 0006 R35).
- `vite.config.ts`: `vue()`, `VueI18nPlugin({ include: 'src/core/i18n/translations/**' })`,
  `VitePWA(...)` behind `// @pwa` lines, the `@` alias, the `/api` proxy to `127.0.0.1:__SERVER_PORT__`,
  `strictPort`, `css.preprocessorOptions.scss.loadPaths: ['src/styles']`, no source maps.
- `vitest.config.mts`: jsdom, `include: ['src/**/*.spec.ts', 'tests/unit/**/*.spec.ts']`,
  `allowOnly: false`, `passWithNoTests: false`, `unstubGlobals: true`, the setup file with
  `matchMedia`, `ResizeObserver` and pointer-capture stand-ins (Reka needs them, as Radix did).
- `eslint.config.mjs`: `eslint-plugin-vue` `flat/recommended` with `vue-eslint-parser` over
  `typescript-eslint`'s parser (`projectService`, `extraFileExtensions: ['.vue']`), typescript-eslint
  `strictTypeChecked`, `eslint-plugin-vuejs-accessibility` recommended, `boundaries` with T1.1's
  elements and policies, `vue/no-restricted-html-elements`, `vue/no-restricted-block`,
  `vue/no-static-inline-styles`, `vue/block-lang` (`ts`), `vue/component-name-in-template-casing`,
  the `no-restricted-syntax` and `no-restricted-imports` rules; `eslint-import-resolver-typescript`
  is mandatory. ESLint 10: every Vue plugin peers it (unlike React's `jsx-a11y`).
- `tsconfig.app.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
  `moduleResolution: bundler`, `types: ['vite/client', 'vite-plugin-pwa/vue']` (the last on a
  `// @pwa` line? JSON takes no marker: the ambient type sits in `vite-env.d.ts` behind a `// @pwa`
  reference line instead), `paths: { '@/*': ['./src/*'] }`, `include: src, tests, vitest.setup.ts`.
- `Dockerfile`, `nginx/`, `compose.yaml`, `.dockerignore`: React's, plus the `@pwa` no-cache lines
  for `sw.js`, `workbox-*.js`, `registerSW.js` and `manifest.webmanifest` in `nginx/default.conf`
  (`.conf` takes `#` markers) and `worker-src 'self'`, `manifest-src 'self'` in the CSP snippet.
  Vite's `dist/assets/*` layout is the same as React's, so both servers' static middleware already
  caches it immutable.
- `template.yaml`: `id: vue`, `name: Vue 3 SPA (Vite)`, `version: 1.0.0`, `runtime` node 24, `tools`
  bun 1.4 and node 24, `commands` as `react`'s, `static: { out: dist }`, `http: { port: 5173, health: / }`,
  `gitignore: [node]`, `defaultStack: vue-bun-express`, `flags.i18n` and `flags.pwa` (`summary`,
  `default`, `onlyPaths`, `dependencies.remove` for `pwa`), `onlyWhen` for `server:auth` and
  `server:database`, `postGenerate: [install, contract, format]`.

### T10. Stacks, cases, release

- Stacks `vue-bun-express` and `vue-python-fastapi`; `index.yaml` entries; the README matrix
  through `validate --readme`.
- `tests/cases.yaml`, Angular's set: `default` (bun-express, single, `withApp`), `split`
  (`withApp`), `python` (python-fastapi, single, `withApp`), `alone`, `auth-off`, `postgres`
  (`--with-services`), `i18n-off`, `pwa-off`, `flags-off`, `brand`. Ten cases; a Vite build is
  seconds, so CI's budget is not Angular's question.
- Release: catalog `v1.8.0`, a minor (a template added; no existing template's files move).
  `frontend/vue` 1.0.0; `CHANGELOG.md`; `CONTRIBUTING.md` "Adding a frontend template" names three
  models and gains "Refreshing `frontend/vue/base`"; `docs/conventions.md › Frontend, single-page
  app` names Vue beside React and Angular; ADR 0006 and ADR 0007 get an "amended by ADR 0008" line
  where they name Vue as out of scope and where they reserve the number for the Next ADR. Then the
  harness lock bump, its own pull request through `dev`.
- Proof the harness owns: a bootstrap of `vue-bun-express` from the harness in a disposable clone
  against this branch of the catalog and one dev-loop task on it (plan 021's proof step).

### T11. The harness

ADR 0006 A3 made the harness layer-agnostic and ADR 0007 R10 finished it; what still enumerates the
frontends by name, for plan 021:

| File | Today | Becomes |
| --- | --- | --- |
| `README.md › What you get` | "A React, Angular or Next frontend" | "A React, Angular, Vue or Next frontend" |
| `.claude/README.md › Frontend choice` | "React and Angular are the single-page frontends … Angular is new in catalog v1.6.0 and React's structure … in v1.7.0" | "React, Angular and Vue are the single-page frontends …; Vue is new in catalog v1.8.0" |
| `.claude/skills/bootstrap-project/SKILL.md` | "(React, Angular)" three times; "`frontend/react`, `frontend/angular`" | "(React, Angular, Vue)"; "`frontend/react`, `frontend/angular`, `frontend/vue`" |
| `.claude/agents/frontend.md` | "and Angular's `AUTH_ROUTES`" | "and Angular's and Vue's `AUTH_ROUTES`" |
| `.claude/skills/error-handling/SKILL.md` | "Angular's interceptor builds an `ApiError`" | "Angular's and Vue's interceptor builds an `ApiError`" (the Vue store method catches it, as Angular's) |
| `.claude/skills/ui-design/SKILL.md` | "Angular's equivalents are listed in its `AGENTS.md › Styling`" | "Angular's and Vue's equivalents are listed in their `AGENTS.md › Styling`" |
| `.claude/skills/writing-plans/template.md` | "Angular: models, service, store, feature, route and nav, view partial, copy keys" | "Angular and Vue: …" |
| `.doc/architecture.md › Primary Components` | "Single-page app (React)" | "Single-page app (React, Angular, Vue)" |
| `.doc/glossary.md › Actions` | "React and Angular features mirror the server's modules" | "React, Angular and Vue features mirror …" |
| `catalog.lock` | v1.7.0 | v1.8.0, in its own pull request after the release |

The `writing-tests`, `code-review`, `api-design`, `database` and `naming` texts name no frontend and
need nothing. `scripts/docs.test.mjs` caps the size-limited files; a word added is a word removed
elsewhere.

## Decisions made while building

Where the code as built differs from the text above, this section wins. Each item was checked
against `frontend/vue/base`.

- **Errors.** `applyFieldErrors(form, error)` takes the form (T4 wrote `applyFieldErrors(error)`).
  `ApiError` has no `details` field: both servers' `details` is an arbitrary value that may hold
  server text, so only `fieldErrors` is derived. `toApiError(cause, context?)` takes an optional
  `context` that is logged, never shown. `useRequestStatus()` returns `fail(cause, context?)`
  (log a non-`ApiError` once, convert, set the error, return it), so a store's catch is one line;
  the store toasts `errorMessageKey(code)` once on failure, reads included (Angular's behaviour);
  the interceptors never toast. The auth store's `Overrides` takes `null` for "the page shows this
  code itself, no toast".
- **A taken email** lands on the email field: the register page maps `conflict` to
  `auth.register.conflict` on the field and `register` passes `{ conflict: null }` (React's model;
  the first build had Angular's toast, fixed in the e2e fix round). Angular still toasts it:
  backlog line `- [ ] angular: a taken email on its field (React/Vue parity)`.
- **The client.** `withLoading(inner?)` and `withRefresh(inner?)` fall back to `globalThis.fetch`
  per call, so `core/config/api-client.ts` names no `fetch` identifier; the lint restriction covers
  `globalThis.fetch` and `window.fetch` as well, outside `auth.interceptor.ts`. The committed
  `src/services/generated/` comes from `server/python-fastapi/base/openapi.json`; a project
  regenerates it from its own server with `contract` at bootstrap.
- **Layers.** `store/` may import `core/i18n` (the language store applies the locale): the T1.1
  `store/` row is widened. `ROLES_KEY` lives in `shared/directives/roles.ts` (always present; the
  side nav injects it), `has-role.ts` (auth only) imports it, and `createHasRoleDirective(roles)` is
  registered in `app/plugins.ts`. `installGlobalErrorHandler(app, notify)` takes a callback, so
  `core/errors` imports no store. `emitSessionLost` isolates its listeners and rethrows a failure
  on a microtask. `env.isDev` (`import.meta.env.DEV`, read in `core/config/env.ts`) reaches
  `shared/` components as the injected `DEV_KEY` (`shared/composables/dev-mode.ts`), provided in
  `app/plugins.ts`.
- **Start-up.** `installPlugins(app)` returns a Promise (the saved language loads before first
  render) and `main.ts` mounts in its `.then`. The auth restore still never blocks the mount:
  `authStore.ready` resolves with a 5 s cap in `useAuthStore.restoreSession`, the guards await it,
  and the session initializer bounces only a signed-in account on `sessionLost`.
- **Markers.** A trailing `// @flag` is legal only on a one-line statement; a multi-line statement
  takes a `-start`/`-end` block (the `vitest.config.mts` alias). `.vue` files take template block
  markers only. JSON takes no markers, so the `pwa` and auth copy blocks stay in `en.json` and
  `he.json` when the flag is off (as Angular). `slots.ts` keeps its two-return functions.
- **Theme.** `THEME_COLORS` and the manifest `theme_color` are fixed values mirroring the
  `index.html` metas (Angular's way); `tests/unit/theme-color.spec.ts` guards the drift. Deriving
  them from the brand tokens in every SPA is a backlog line. `public/theme-init.js` JSON-parses the
  stored theme (the storage provider writes JSON), and the auth layout creates the theme store
  itself because it has no header; the e2e found both.
- **Forms.** `zod-form.spec.ts` tests the composable with a local zod schema (the generated
  `zCredentials` exists only with auth and its email rule differs per server: python has a pattern,
  bun does not); `auth.form.spec.ts` covers the generated schema.
- **zod under the CSP.** zod 4 probes `new Function('')` at its first parse, a CSP violation under
  the deployed `script-src 'self'` (seen in the Compose leg). `shared/validators/zod-config.ts`
  sets `z.config({ jitless: true })` and is imported first by `main.ts`, `core/config/env.ts`,
  `auth.form.ts` and `user.form.ts`, because the build splits shared code into chunks and a chunk's
  modules run before the importer's body. `tests/unit/zod-config.spec.ts` pins the import-first
  rule for every module that imports zod at run time; it finds the imports statement by statement
  (multi-line, either quote) with a named matcher and three fixtures. React's `zod-messages.ts` is
  the precedent; Angular has no such guard: backlog line
  `- [ ] angular: confirm zod 4's new Function probe under the CSP`.
- **PWA.** The iOS install hint is a toast with a persisted Dismiss, not a header banner;
  `promptInstall` clears the one-shot offer before prompting and returns false on failure. nginx
  names an explicit `# @pwa-start`/`# @pwa-end` no-cache block for `sw.js`, `registerSW.js`, `workbox-*.js` and the
  manifest (React's config never named them; its generic extension rule covered them by accident);
  the CSP is a `# @pwa` / `# @nopwa` pair of lines.
- **Build and e2e.** An in-place `vite build` fails on the `__THEME_*__` placeholders in
  `brand.css` (as React and Angular); the generated cases are the build gate. Playwright's
  `serviceWorkers: 'block'` logs one console warning, and vite-plugin-pwa 2.0.0 logs "Service worker
  registration failed … reading 'waiting'": the e2e console assertion filters those two
  signatures (T8 and the S4 note said one). A CSP no-eval proof loads a same-origin script file;
  `offlineReady` is never asserted. `tests/e2e/screens.spec.ts` is valid TypeScript in the
  template (React's only parses after marker processing); without a database the `databaseUrl`
  member leaves `SetupAccount` with its marker, so a role setup that touches it fails typecheck
  where React throws at run time.
- **Components.** The header slot functions keep T1's names (`accountSlot`, `languageToggle`,
  `installButton`). `AppButton` takes `to` (a route, rendered as a `RouterLink`), not `link`.
  `AppModal` takes a `title` that arrives already translated, not a `titleKey`. `ConfirmDialog`
  is presentational: `v-model:open` plus `confirm` and `cancel` events, no promise service. The account
  menu is a hand-rolled disclosure (`src/layout/components/account-menu.vue`: `role="group"`,
  Escape and focus-out close, Angular's pattern), not Reka `DropdownMenu` as T5 says.
- **Offline.** The network store exposes `online` only. The refusal of a mutation while offline is
  in the mutating stores: the auth store's `offline()` and the user store's `update` check
  `network.online`, toast `errors.offline` and send no request.
- **Agents file.** `layout/` may not import `core/guards`. The session hint key is
  `session-hint` (React and Angular use `session`). `validation_failed` is never toasted by a store.
  Copy parameters are vue-i18n's `{param}` (Angular's are `{{param}}`). The e2e runs behind
  `vite preview`, not a custom static server.
- **Verification.** The Compose legs ran locally with `--with-app`: `single` (53 e2e against the
  server image) and the `split` case (nginx image, 53 e2e passed).

## Alternatives considered

- **Pinia Colada as the data layer** (Hey API's `@pinia/colada` plugin generating query options;
  the Vue counterpart of RTK Query). Rejected for 1.0.0: Eitan asked for Pinia stores; one state
  model per app, as Angular's; a product that needs a query cache adds Colada by plan, and the
  facades stay the one call site either way.
- **Mirror the Angular tree file for file** (`core/providers/*.service.ts` as injectables through
  `provide`/`inject`, `rxMethod`-style stores). Rejected where Vue has an idiom: Pinia setup stores
  are the one state mechanism, Vue Router's `beforeEnter` is the guard, a fetch wrapper and the
  client's interceptors are the interceptors, a Vue plugin is the initializer.
- **File-based routing** (Vue Router 5 bundles `unplugin-vue-router`). Rejected: the layer map
  puts a feature's routes in its `*.routes.ts`, composed by `app/routes.ts`; file-based routes
  would move the table into `pages/` names and out of the agent's recipe.
- **vee-validate.** Its zod adapter peers zod 3 and vee-validate 5 is a beta (`5.0.0-beta.0`); the
  template's forms are the composable of T4, TanStack Vue Form the fallback.
- **Keeping the `Translator` indirection** so vue-i18n can be removed when `i18n` is off.
  Rejected: vue-i18n is the idiomatic `t` and a few kilobytes; the indirection would cost an
  abstraction in every template string for a dependency a project rarely removes.
- **A separate `core/providers/` store set** (app-state stores there, domain stores in `store/`).
  Rejected: two homes for Pinia stores make an agent guess; `store/` holds all of them.
- **Pages as folders** (`pages/health-status/health-status-page.vue` + spec). Rejected: one `.vue`
  file and one spec per page need no folder; a page that grows a private component makes one.
- **Tailwind, shadcn-vue, PrimeVue, Vuetify.** Rejected: the SCSS tree is the rule for every SPA
  (ADR 0006); Reka UI gives the behaviours without a look.
- **`@vueuse/core`.** Not added: the two composables the template needs (`useMediaQuery`,
  `useUniqueId`) are a few lines each; a product adds VueUse by plan.
- **`.test.ts` instead of `.spec.ts`.** Vue's scaffolds and Angular's template use `.spec.ts`; kept.
  The harness's `verify` axe-exclusion check reads every `*.spec.*` as an e2e spec (plan 019's
  follow-up line), harmless while no unit spec calls `.exclude(`.

## Consequences

- The catalog carries four frontend vocabularies; the harness carries none, and its generic texts
  enumerate four frontends (T11).
- The Vue and Angular agents files read alike (page → store → service → SDK; the same copy keys,
  the same guards and session rules), so the dev loop's recipe for a new module is the same in both
  with Vue's spelling.
- vue-i18n ships in every Vue project; the flag only removes Hebrew and the toggle.
- The forms composable is template code the catalog maintains; TanStack Form is a one-plan swap.
- The two-return slot file is the price of markers in `.vue`; a product adds a flag-gated header
  control the same way.

## Out of scope

Next on the SCSS tree (the next ADR number). Pinia Colada. Vue 3.6 and Vapor mode (3.6 is a release
candidate). SSR (Nuxt). A file-upload service with XHR progress (proposed backlog line:
`- [ ] vue: file-upload service with XHR progress and cancel`). A data-table page. An offline
mutation queue. Push notifications. Per-feature i18n message chunks. Proposed backlog lines, as
ADR 0007's for React: `- [ ] react: i18n flag (en/he, RTL) on the SCSS tree`, `- [ ] react: pwa
flag (manifest, icons, vite-plugin-pwa)` stay open and now have a Vue implementation to copy.

## Spikes (throwaway, before the plan's build steps)

- **S1. The client.** `@hey-api/openapi-ts` 0.99 with the bundled fetch client, the flat SDK and zod
  4 from `python-fastapi`'s committed `openapi.json`, `throwOnError: true`; `runtimeConfigPath`
  importing `withLoading` and `withRefresh` builds under Vite and runs under Vitest with no cycle;
  a `client.interceptors.error` function's return value is what the SDK throws, for an envelope and
  for a thrown `fetch` alike (the generated client's source says so at 0.99.0; the spike re-proves
  it in a generated tree); `withLoading` counts one exchange once around a replayed 401 and a
  thrown `fetch`. Fallback: React's `call()` inside the facades.
- **S2. Forms.** `useZodForm` over `zCredentials` with `form-field.vue` and `app-input.vue`: the
  first error after touch or submit, `aria-invalid` and `aria-describedby`, a server field error by
  path, an unmapped path returned, the confirm `match`; the composable and the field under ~200
  lines together. Fallback: `@tanstack/vue-form` 1.33 with the generated schema as a Standard
  Schema validator.
- **S3. i18n under the CSP.** vue-i18n 11 with `@intlify/unplugin-vue-i18n` precompiling `en.json`
  and `he.json`; the production bundle runs under `script-src 'self'` with no `unsafe-eval`; `he`
  lazy-loads as its own chunk; `dir="rtl"` flips the layout; the `i18n=false` tree keeps vue-i18n
  with `en` only and renders every key.
- **S4. The worker.** `vite-plugin-pwa` 2 with `registerType: 'prompt'`, `useRegisterSW` from
  `virtual:pwa-register/vue`, the manifest in `vite.config.ts` behind `// @pwa` lines; the
  `pwa=false` tree builds with no `sw.js` and no manifest after `dependencies.remove`; Playwright's
  `serviceWorkers: 'block'` keeps the e2e clean; the runtime rule caches `/api/health` only.
- **S5. Tooling and peers.** ESLint 10.14 with `eslint-plugin-vue` 10.12, `vue-eslint-parser` 10.4,
  `eslint-plugin-vuejs-accessibility` 2.6, `typescript-eslint` 8.72 (`projectService`,
  `extraFileExtensions`), `eslint-plugin-boundaries` 7.4 resolving `.vue` imports through the
  TypeScript resolver; `vue/no-restricted-html-elements` and `vue/no-restricted-block` fire with
  our messages; `vue-tsc -b` type-checks a template error; Vitest 5 with jsdom, Testing Library
  Vue and `@pinia/testing`; Prettier formats `.vue`. Records every peer warning. Fallback: ESLint 9;
  the Angular template's scan specs for the two rules.
- **S6. Markers in `.vue`.** An `<!-- @i18n-start -->` … `<!-- @i18n-end -->` block inside a
  `<template>` survives `prettier --write` (the base's `.prettierrc`, print width 100) and passes
  `applyMarkers` and `validate`'s dry run; a trailing `<!-- @x -->` after a long tag is shown to
  move under Prettier (the reason for the block-only rule); a `// @pwa` inside `<script setup>`
  fails generation as a leftover (the rule, not a bug); `slots.ts`'s two-return functions pass
  `vue-tsc`, lint (`no-unreachable` off for the file) and generation in every combination.
  Fallback: `tools/lib/markers.ts` lets `.vue` take `//` markers inside its script block, with a
  tools test; recorded as a tool change first.

All six passed on 2026-11-07 with no fallback taken:

- S1: `@hey-api/openapi-ts` 0.99.0, zod 4.6.7.
- S2: `useZodForm` over `zCredentials`, zod 4.6.7.
- S3: vue-i18n 11.4.18, `@intlify/unplugin-vue-i18n` 11.2.8.
- S4: `vite-plugin-pwa` 2.0.0, `workbox-window` 7.4.1.
- S5: ESLint 10.14.0, `eslint-plugin-vue` 10.12.0, `eslint-plugin-vuejs-accessibility` 2.6.3,
  `eslint-plugin-boundaries` 7.4.2, Vitest 5.1.0, `vue-tsc` 3.3.14.
- S6: Prettier 3.9.10 on `.vue` with the block-only marker rule.

## Left to the builder

The recipe text under `Adding a feature`; the exact SCSS partial list and BEM names (the Angular
partials are the model); the Reka data-attribute selectors per component; the `render` and
`stubApi` signatures; the `useZodForm` API beyond T4; the `styles-tree` scan; the health page's
composition against the `ui-design` rubric; the translation keys (Angular's `en.json` and `he.json`
are the model and may be copied where the screens match, with Transloco's `{{param}}` rewritten as
vue-i18n's `{param}` and a literal `@`, `|`, `{` or `}` escaped as `{'@'}`; the parity test
compares keys and `{param}` names); the `.env.example` content (the package reads no runtime
environment); the manifest and icon set; the changelog text.

## Versions (registry, 2026-11-07; re-verify at build, never from memory; the latest stable at least 14 days old)

Corrected at build to `frontend/vue/base/package.json` and `bun.lock`: every row below is what the
lock resolved (runtime dependencies and a few tools are pinned exactly, the rest are caret ranges
that the lock holds at these versions).

| Package | Version | Note |
| --- | --- | --- |
| `vue` | 3.5.44 | 3.5.45 (2026-11-05) is under 14 days at writing; take it at build if it clears. 3.6 is a release candidate, not used |
| `vue-router` | 5.4.0 | no breaking change for explicit route tables; file-based routing unused; optional peers on `pinia` and `@pinia/colada` unused |
| `pinia`, `@pinia/testing` | 4.1.0, 2.0.2 | Pinia 4 is ESM only |
| `@vitejs/plugin-vue` | 6.0.10 | peers Vite 8 |
| `vue-tsc` | 3.3.14 | `typecheck` |
| `vite`, `sass-embedded` | 8.3.6, 1.108.1 | as `react` |
| `vitest`, `jsdom` | 5.1.0, 31.0.0 | as `react` (Vitest under 14 days there too, recorded) |
| `@vue/test-utils`, `@testing-library/vue`, `user-event`, `jest-dom`, `dom` | 2.5.1, 8.1.0, 14.6.8, 7.0.1, 10.4.2 | `@testing-library/vue` last published 2024-05; peers `vue >= 3` |
| `eslint`, `@eslint/js` | 10.14.0, 10.0.1 | every plugin below peers `^10` (their `peerDependencies` read on the registry, 2026-11-07) |
| `eslint-plugin-vue`, `vue-eslint-parser` | 10.12.0, 10.4.2 | |
| `eslint-plugin-vuejs-accessibility` | 2.6.3 | |
| `typescript-eslint`, `eslint-plugin-boundaries`, `eslint-import-resolver-typescript` | 8.72.1, 7.4.2, 4.4.5 | the resolver is mandatory |
| `typescript` | 5.9.3 | typescript-eslint peers `<6.1.0`; `react` and `next` are on 5.9 |
| `reka-ui` | 2.11.0 | |
| `lucide-vue-next` | 1.0.0 | |
| `zod` | 4.6.7 | |
| `vue-i18n`, `@intlify/unplugin-vue-i18n` | 11.4.18, 11.2.8 | |
| `vite-plugin-pwa`, `workbox-window` | 2.0.0, 7.4.1 | 2.0.0 is 2026-10-03; peers Vite 8 |
| `@hey-api/openapi-ts` | 0.99.0, pinned exactly | 0.x; plugins typescript, client-fetch, sdk, zod |
| `@playwright/test`, `@axe-core/playwright` | 1.65.0, 4.14.0 | |
| `prettier` | 3.9.10 | |
| `@fontsource-variable/inter` | 5.3.0 | |
| `@types/node` | 24.19.2 | as `react`; 26.x is the registry's latest and is not Node 24's |

Not used, with the reason: `vee-validate` 4.15.1 and `@vee-validate/zod` (peers zod `^3.24`;
5.0.0-beta.0 only), `@tanstack/vue-form` 1.33.5 (the forms fallback), `@pinia/colada` 1.4.9 (the
query-cache alternative), `@vueuse/core` 15.0.0, `vue-sonner` (Reka Toast is the one toast).
