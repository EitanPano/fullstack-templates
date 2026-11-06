# ADR 0006: Per-framework frontend structure and the Angular SPA template

Status: accepted (2026-11-06, Eitan: "approved, write the plan"; built under plan 019)
Owner: Eitan
Plan: `fullstack-dev-harness/.plan/019-2026-11-06-angular-spa.md`
Amends: `docs/conventions.md` (the frontend and SPA contracts), ADR 0003 M5-1, ADR 0005 F1 and F2
Follow-ups it opens: ADR 0007 (React on Redux and RTK Query, its own structure), ADR 0008 (Next on
the global SCSS tree)

## Context

- v1.5.1 ships two frontends, `next` and `react`, on one layer map (ADR 0005 F1: `app/`, `widget/`,
  `feature/`, `entity/`, `shared/`) and one design system (shadcn on Tailwind, F2). The SPA
  contract in `docs/conventions.md` committed "Vue and Angular later" to the same shape.
- On 2026-11-06 Eitan ruled otherwise: Angular, Vue, React and Next applications are not supposed to
  share one structure. Each framework gets its idiomatic layout, declared in its template's
  `AGENTS.md`. The global SCSS tree in A2 becomes the styling rule for every SPA, and for Next once a
  build proves it costs nothing. React's own structure is to be revisited, with Redux and RTK Query.
  Those two are follow-ups with their own ADRs; this one settles the contract split and the first
  template on the new footing.
- The harness (`fullstack-dev-harness`) loads a package's `AGENTS.md` for its layer map, yet six of
  its own files name the React layers (A3). Its definition of done leans on contract facts that are
  not about folders: generated types, the error envelope, the shell landmarks, the screens checks,
  the brand tokens, the gates. Those are what A1 keeps.
- The first template is an Angular 22 single-page app with the structure Eitan specified (A2), two
  flags (`i18n`, `pwa`), everything else in the base, and the `module` placeholders of his tree as a
  recipe in the agents file rather than code.

## Decisions

Each decision lists what it costs.

### A1. The frontend contract splits into invariants and a per-template layer map

`docs/conventions.md › Frontend` keeps only what every frontend must satisfy regardless of
framework. Folders, state, forms, the design system and the import graph move to each template's
`AGENTS.md`. The React and Next shape stays what ADR 0005 F1 describes, now as the content of
their agents files rather than the catalog's rule; every sentence removed from the conventions is
checked present in the owning template's `AGENTS.md` before it goes (the plan has that step). A
sentence missing there is added. A template whose agents file changes gets a patch bump
(`react` 2.1.2, `next` 2.1.2) and a `Changed` changelog entry; a docs patch sits inside the
v1.6.0 minor. The shadcn pin is already in both agents files, so A3's scaffolder line needs no
edit there.

The invariants kept, numbered so the harness can cite them:

1. **Contract types.** `contract` generates the types, the client and the zod schemas into a
   committed, never-edited directory the agents file names. No hand-written API types. A form schema
   derives from the generated request schema and never copies a validation limit.
2. **One origin.** The API is reached at relative `/api/*` on the page's origin in every deploy
   mode; the dev server proxies it; no API URL is compiled in; CORS stays off. One env module is the
   only reader of build-time environment, browser-visible values only, never a secret.
3. **Errors and loading.** The envelope's `code` maps through the template's copy tables; the
   server's text never reaches the user; a toast fires from the handler after the await, never from
   an effect or an interceptor. Every route has a loading and an error state; every data section has
   a skeleton that matches its layout.
4. **Shell.** A skip link to `#main`, first in the tab order; `<header>` with the display name
   linking to `/`; `<nav aria-label="Primary">` built from one nav table; the page's one
   `<main id="main">`; `<footer>`. A feature adds a nav entry and renders inside `main`, never a
   second landmark set.
5. **Mobile first.** No horizontal overflow at any viewport. Controls are at least 44 x 44 px on a
   coarse pointer, icon buttons included; one component is the one place for a button.
6. **Brand and theme.** The generator's inputs (`--display-name`, `--brand-primary`,
   `--brand-neutral`, `--radius`, `--font`, `--theme`, `--density`), its contrast checks and its
   OKLCH token names are the one semantic set across frontends. Light values in `:root`, dark values
   under a selector the template declares (`.dark` or `[data-theme="dark"]`). Light, dark and system,
   the default from the brand input, a toggle in the user menu. The no-flash theme script is a file,
   never inline: the deployed pages carry `script-src 'self'`.
7. **Auth glue**, only with `server:auth`. Guards for account and role; `/forbidden` for a wrong
   role; a 401 becomes one refresh and a retry, and concurrent refreshes collapse into one; the
   session hint is a `localStorage` flag that is never a token, set after sign-in and cleared on
   sign-out and on a refresh 400, 401 or 403; a user menu with avatar, email, theme and sign out.
8. **Gates.** typecheck, lint, format and unit tests, without Docker. E2E on `phone` (`Pixel 7`,
   touch) and `desktop` (`Desktop Chrome`): `shell.spec` (landmarks, skip link, overflow, targets),
   `screens.spec` (every nav route plus the auth screens, both themes, axe WCAG A and AA, no
   horizontal scroll, one `h1`, `SIGNED_IN_ROUTES`), the auth journeys, `E2E_BASE_URL`, the
   `e2eDb && start` chain, `RATE_LIMIT_SCALE=100`, `retries: 0`. Unit tests of the template's own
   glue. A boundaries test that lints one violation and one allowed case per import rule through the
   real ESLint config, each message naming the layer to use instead.
9. **Shipping.** `static: { out }` with `index.html` at that root and content-hashed files; a
   Dockerfile with the `dist` and `serve` targets; the nginx config and its security-header snippet;
   a `compose.yaml` fragment per deploy mode; `onlyWhen` for the server's selections.
10. **The agents file.** The headings `Adding a feature`, `Styling`, `Errors`, `Tests` and
    `Deployment`; the layer map; the import rules with the lint that enforces them; and under
    `Adding a feature` the recipe for a new module, file by file. The recipe is documentation, as the
    server's `Adding a module` is; a template never ships placeholder code.

Why: these are what the dev loop, QA, the screens checks and the brand generator consume. None of
them cares whether a slice is `entity/health` or `features/health`.

Cost: two vocabularies in the catalog, and three once React moves. A convention about structure is
written per template. The harness's wording goes generic (A3). The `Frontend, single-page app`
block of the conventions shrinks to invariants 2, 8 and 9's SPA specifics (no proxy, the static
build, the e2e serving) and loses its React lines.

### A2. The Angular template

`frontend/angular` 1.0.0: Angular 22, standalone components, signals, `@ngrx/signals` stores, Hey
API's Angular client, Transloco behind the `i18n` flag, the Angular service worker behind the `pwa`
flag, global SCSS. Eitan's tree, with every reconciliation marked `▲` and explained below it:

```
src/
├── main.ts                                # bootstrapApplication(App, appConfig)
├── index.html                             # <app-root>; manifest link (@pwa), theme-color light + dark, noscript;
│                                          #   <script src="/theme-init.js"> ▲ (a file, never inline)
├── app/
│   ├── app.component.ts                   # <router-outlet>, nothing else
│   ├── app.config.ts                      # router, provideHttpClient(withInterceptors([...])), provideHeyApiClient,
│   │                                      #   Transloco (@i18n), provideServiceWorker (@pwa), ErrorHandler, initializers
│   ├── app.routes.ts                      # layouts + lazy loadChildren per feature; '**' → not-found
│   ├── nav.ts                             # ▲ the one nav table: NavEntry { path, labelKey, roles? }
│   ├── core/                              # singletons wired once in app.config.ts; never imported by shared/
│   │   ├── config/
│   │   │   ├── app-config.token.ts        # InjectionToken over environment (no apiUrl ▲: the API is relative /api)
│   │   │   ├── api-client.ts              # ▲ the generated client's configuration: origin, withCredentials
│   │   │   └── constants.ts
│   │   ├── interceptors/
│   │   │   ├── auth.interceptor.ts        # withCredentials; 401 → one refresh (shared in flight) → retry (@server:auth)
│   │   │   ├── error.interceptor.ts       # HttpErrorResponse → ApiError; no toast here ▲ (invariant 3)
│   │   │   └── loading.interceptor.ts     # in-flight count → LoadingService signal
│   │   ├── guards/
│   │   │   ├── auth.guard.ts              # canMatch; redirects to /auth/login (@server:auth)
│   │   │   ├── role.guard.ts              # route data.roles vs authStore.roles(); → /forbidden (@server:auth)
│   │   │   └── unsaved-changes.guard.ts   # canDeactivate for dirty forms
│   │   ├── providers/
│   │   │   ├── storage.service.ts         # safe local/session storage; no tokens
│   │   │   ├── logger.service.ts          # strips tokens, passwords, PII
│   │   │   ├── notification.service.ts    # toasts (shared/components/toast on the CDK overlay)
│   │   │   ├── loading.service.ts         # ▲ the signal the loading interceptor drives
│   │   │   ├── theme.service.ts           # light | dark | system → <html data-theme> (resolved) + theme-color
│   │   │   ├── network.service.ts         # online signal; stores refuse mutations offline, header shows a badge
│   │   │   ├── app-update.service.ts      # SwUpdate: on load, hourly, on focus; toast → activate + reload (@pwa)
│   │   │   └── install-prompt.service.ts  # beforeinstallprompt; canInstall + promptInstall(); iOS hint (@pwa)
│   │   ├── i18n/
│   │   │   ├── translator.provider.ts     # ▲ provides shared/i18n Translator: Transloco (@i18n) or static en (@noi18n)
│   │   │   ├── i18n.config.ts             # provideTransloco: en/he, default en, fallback en (@i18n)
│   │   │   ├── languages.ts               # [{ code, dir, locale }] (@i18n)
│   │   │   ├── transloco-http.loader.ts   # /i18n/{lang}.json (@i18n)
│   │   │   ├── language.service.ts        # lang signal; <html lang dir>; saved choice (@i18n)
│   │   │   ├── missing-key.handler.ts     # (@i18n)
│   │   │   └── translations/
│   │   │       ├── en.json                # the copy table; base in both modes
│   │   │       └── he.json                # (@i18n) same keys, a unit test asserts parity
│   │   ├── errors/
│   │   │   └── global-error-handler.ts
│   │   └── initializers/
│   │       ├── session.initializer.ts     # authStore.restoreSession() before the first route (@server:auth)
│   │       ├── i18n.initializer.ts        # saved or browser language before first render (@i18n)
│   │       └── pwa.initializer.ts         # update checks + install listener (@pwa)
│   ├── layout/
│   │   ├── main-layout/main-layout.component.ts      # skip link, <app-header>, <app-side-nav>, <main id="main">, <app-footer>
│   │   ├── auth-layout/auth-layout.component.ts     # centred <main id="main"> (@server:auth)
│   │   └── components/
│   │       ├── header/                    # name → '/', language toggle (@i18n), theme toggle, install (@pwa), offline
│   │       │                              #   badge, user menu (@server:auth), nav toggle on phones
│   │       ├── side-nav/                  # <nav aria-label="Primary"> from app/nav.ts filtered by role; drawer < lg
│   │       └── footer/
│   ├── features/
│   │   ├── health/                        # ▲ the live example (replaces the `module` placeholders)
│   │   │   ├── health.routes.ts
│   │   │   ├── pages/health-status/       # the home screen: status, last checked, refresh
│   │   │   └── components/health-badge/
│   │   ├── auth/                          # (@server:auth)
│   │   │   ├── auth.routes.ts             # auth-layout; login and register public; verify-otp behind auth.guard
│   │   │   ├── auth.form.ts               # typed form builders over the generated zod request schemas
│   │   │   └── pages/{login,register ▲,verify-otp}/
│   │   ├── user/                          # (@server:auth)
│   │   │   ├── user.routes.ts
│   │   │   ├── user.form.ts
│   │   │   └── pages/profile/
│   │   ├── forbidden/                     # ▲ role.guard's target (@server:auth)
│   │   └── not-found/
│   ├── store/
│   │   ├── auth.store.ts                  # user, isLoggedIn, roles; login / register / logout / otp / refresh (@server:auth)
│   │   ├── user.store.ts                  # (@server:auth)
│   │   ├── health.store.ts                # ▲ the live example
│   │   └── with-request-status.ts         # signalStoreFeature: loading / error / loaded
│   ├── services/
│   │   ├── generated/                     # ▲ Hey API output: types, zod, the Angular client, flat SDK; committed, never edited
│   │   ├── health.service.ts              # ▲ facade over the generated SDK, one per server module
│   │   ├── auth.service.ts                # (@server:auth)
│   │   ├── user.service.ts                # (@server:auth)
│   │   └── file-upload.service.ts         # HttpClient with reportProgress; cancel = unsubscribe; size and type checks
│   ├── shared/
│   │   ├── components/                    # button, form-field, form-actions, page-header, data-table, modal, toast,
│   │   │                                  #   empty-state, error-state, skeleton, spinner, auth-card (@server:auth);
│   │   │                                  #   CDK for overlay, focus trap, menu, dialog; the ui-design rubric's names
│   │   ├── directives/
│   │   │   ├── has-role.directive.ts      # *appHasRole, reads the ROLES token ▲ (@server:auth)
│   │   │   └── autofocus.directive.ts
│   │   ├── i18n/
│   │   │   └── translator.ts              # ▲ abstract Translator { lang; translate(key, params) } and the ROLES token's sibling
│   │   ├── pipes/
│   │   │   ├── translate.pipe.ts          # ▲ `t`, impure, over Translator
│   │   │   ├── relative-time.pipe.ts
│   │   │   └── phone.pipe.ts
│   │   ├── validators/                    # zodValidator(schema) ▲, phone, password, match
│   │   └── utils/                         # time.ts, http-params.ts; pure, no DI
│   └── models/
│       ├── api/response.ts                # ApiError, Paginated<T> over the generated envelope types ▲
│       ├── health/                        # ▲ the live example
│       └── user/{interface,type,enum,constants}.ts   # re-exports of generated types + UI-only types (@server:auth)
├── environments/
│   ├── environment.ts                     # production flag, feature flags; no apiUrl ▲, no secrets
│   └── environment.prod.ts
└── styles/                                # the only place styles live; components have no styles (a unit test asserts)
    ├── styles.scss                        # @use setup → themes → basics → components → views
    ├── setup/{_variables,_breakpoints,_functions,_mixins,_typography}.scss
    ├── themes/
    │   ├── _index.scss                    # :root { __THEME_LIGHT__ } [data-theme="dark"] { __THEME_DARK__ } ▲; color-scheme
    │   ├── _light.scss                    # product tokens beyond the generated set, light values
    │   └── _dark.scss                     # the same keys, dark values
    ├── basics/{_helpers,_base,_layout}.scss
    ├── components/{_header,_side-nav,_footer,_modal,_data-table,_toast,...}.scss
    └── views/{_health-status,_login,_register,_verify-otp,_profile,_forbidden,_not-found}.scss

public/
├── theme-init.js                          # ▲ applies the saved or system theme before first paint (CSP: a file)
├── favicon.ico
├── manifest.webmanifest                   # (@pwa)
└── icons/                                 # (@pwa)

tests/
├── e2e/{shell,screens,smoke,auth}.spec.ts, screen-routes.ts, support.ts, auth-support.ts
└── unit/                                  # tooling checks: eslint-boundaries, playwright-config, e2e-database-url,
                                           #   no-component-styles, translation-parity, restricted-elements
scripts/{e2e-static.mjs ▲, e2e-database-url.ts}
proxy.conf.json                            # /api → http://localhost:__SERVER_PORT__
ngsw-config.json                           # app shell prefetch, assets lazy, /i18n/** performance, /api/** freshness
                                           #   with a short maxAge, never /api/auth/**
angular.json, openapi-ts.config.ts, eslint.config.mjs, playwright.config.ts, tsconfig*.json, package.json, bun.lock,
Dockerfile, nginx/{default.conf,security-headers.conf}, .dockerignore, .prettierrc, .prettierignore, .env.example
```

The reconciliations, each with its reason:

- **`features/health/` replaces the `module` placeholders.** The paste's `features/module/`,
  `store/module.store.ts`, `services/module.service.ts`, `models/module/` and
  `styles/views/_module-list.scss` are the recipe under `AGENTS.md › Adding a feature`, file by
  file, with `health` as the worked example (invariant 10). Unreferenced placeholder code would
  have to pass lint and typecheck forever, and `module` collides with the glossary rule.
- **`services/generated/` and the facades.** The generated client lives inside `services/`, the
  only layer that may import its runtime (invariant 1). `services/<module>.service.ts` is an
  `@Injectable({ providedIn: 'root' })` facade over the flat SDK functions, one per server module,
  returning typed results and `ApiError`s. The paste's `api.service.ts` (hand-typed get, post,
  patch, delete) is what the generated client is, so it is dropped; what remains of it, the
  origin and `withCredentials`, is `core/config/api-client.ts`. `file-upload.service.ts` keeps
  raw `HttpClient` because progress events need it; the template has no upload endpoint, so it is
  a unit-tested capability with the URL passed by the caller.
- **`models/` re-exports.** `models/<noun>/interface.ts` re-exports the generated types and adds
  UI-only shapes; `enum.ts` and `constants.ts` hold labels and option lists. A hand-written API
  shape is a lint error (`no-restricted-imports` keeps `@angular/common/http` and the SDK runtime
  out of `models/`).
- **One nav table.** `app/nav.ts` holds `NavEntry { path, labelKey, roles? }`; `side-nav`
  renders it filtered by role and `tests/e2e/screen-routes.ts` reads it (invariants 4 and 8).
- **The translator indirection.** Templates and code never branch on the `i18n` flag. The `t` pipe
  and `inject(Translator)` resolve keys from `en.json` in both modes; `core/i18n/translator.provider.ts`
  binds `Translator` to Transloco (`@i18n`) or to a static reader of the bundled `en.json`
  (`@noi18n`). Without it every template would carry two copies of each string. Error copy tables
  map an envelope `code` to a key; the key resolves through the same translator (invariant 3).
- **The pwa flag keeps the build option.** `angular.json` is JSON and cannot carry a marker, so
  `serviceWorker: "ngsw-config.json"` and `ngsw-config.json` stay in the base. `pwa=false` removes
  the manifest, the icons, the two services and the initializer, and marks out
  `provideServiceWorker`, the manifest link and the header's install control. Cost: a project
  without the flag builds an unregistered `ngsw-worker.js` into `dist` (see spike S4 for the way
  out).
- **`has-role` reads a token.** `shared/` never imports `store/`, so the directive reads
  `ROLES`, an `InjectionToken<Signal<string[]>>` declared in `shared/` and provided in
  `app.config.ts` from the auth store.
- **`register`, `forbidden`, `verify-otp`.** The server has `/api/auth/register`, so the template
  has the page (the e2e auth journey registers, signs in, signs out). `features/forbidden/` is
  `role.guard`'s target (invariant 7). The server's OTP endpoints require an authenticated
  account, so `verify-otp` is a verification step for a signed-in account behind `auth.guard`, not
  a sign-in method.
- **The error interceptor maps, the handler toasts.** `error.interceptor.ts` turns an
  `HttpErrorResponse` into `ApiError` (status, `code`, `requestId`, field errors) and nothing else;
  the store method or page that awaited the call shows the toast through its copy table
  (invariant 3).
- **`theme-init.js` is a file**, as in `react`, and `data-theme` always holds the resolved value
  (`light` or `dark`); `theme.service` tracks `system` through `matchMedia` and rewrites it. One
  dark block in CSS, no `prefers-color-scheme` duplicate of the generated tokens.
- **No `apiUrl`.** `environments/` carries `production` and feature flags; the client resolves
  `window.location.origin` and calls `/api` (invariant 2).
- **Tests have two homes.** Package specs are co-located, `src/**/*.spec.ts`, the Angular idiom and
  `ng test`'s default; `tests/unit/` holds the checks on files outside `src/` (the ESLint config,
  the Playwright config, the e2e database URL, the no-styles and translation-parity scans) and runs
  under the same `ng test` through its `include` globs, each file carrying
  `// @vitest-environment node`.
- **The generated tokens are the theme.** `themes/_index.scss` places `__THEME_LIGHT__` under
  `:root` and `__THEME_DARK__` under `[data-theme="dark"]`, with `--radius: __THEME_RADIUS__` and
  `color-scheme`. `_light.scss` and `_dark.scss` hold the product's additions beyond the generated
  set, the same keys in both. `_typography.scss` takes `__THEME_FONT_STACK__`; `index.html` takes
  `data-density="__THEME_DENSITY__"`. The brand generator, its contrast checks and the QA rubric are
  untouched (invariant 6).

#### A2.1 Layers and import rules

`eslint-plugin-boundaries` element types and what each may import. A feature never imports another
feature. Every message names the layer to use instead; `tests/unit/eslint-boundaries.spec.ts` lints
one violation and one allowed case per row.

| From | May import |
| --- | --- |
| `app/` (`app.config.ts`, `app.routes.ts`, `nav.ts`) | layout, features (lazy routes only), core, store, shared, models |
| `layout/` | core, store, shared, models |
| `features/<f>/pages/` | store, shared, models, `core/config`, `core/providers`, its own feature's `components/` and `*.form.ts` |
| `features/<f>/components/` | shared, models |
| `features/<f>/*.routes.ts` | `core/guards`, its own pages |
| `features/<f>/*.form.ts` | shared/validators, models, the generated zod schemas |
| `store/` | services, models, `core/providers`, `core/config` |
| `services/` | models, `core/config`, `services/generated` |
| `core/guards`, `core/interceptors`, `core/initializers` | store, services, core, shared, models (they are the wiring) |
| `core/config`, `core/providers`, `core/i18n`, `core/errors` | shared, models |
| `shared/` | shared, models |
| `models/` | the generated types and zod schemas, `import type` only |

Also lint-enforced: `@angular/common/http` is imported only in `services/`, `core/interceptors`
and `core/config`; `services/generated` runtime only in `services/`; `<button>`, `<input>`,
`<select>` and `<textarea>` elements only inside `shared/components/` (invariant 5; the mechanism is
the builder's: an angular-eslint template rule if one fits, else the `restricted-elements` scan in
`tests/unit/`).

Why: the paste's rules ("pages inject stores, never services or HttpClient", "components are
presentational", "shared never imports features, store or services", "core never imported by
shared") become checkable, and the cycle core ↔ store is cut at the file level: the wiring
directories may reach the store, the providers may not.

Cost: a new feature's page that wants a one-off request has to add a service and a store method
first. That is the point.

#### A2.2 Data flow

Page → store → service → generated SDK. A store is a `signalStore` with `withState`,
`withComputed`, `withMethods` and `withRequestStatus`; its methods are `rxMethod`s or `async`
functions that call the facade and set state; a page reads signals and calls methods. Reads refresh
by method call; there is no query cache layer. A store refuses a mutation while
`network.online()` is false and reports it through the copy table. Mutations invalidate by calling
the store's own reload.

Why: Eitan asked for stores; one state model per app is easier for an agent than a store beside a
query cache. Cost: no request deduplication or background refetch for free. A product that needs
them adds TanStack Angular Query by plan.

#### A2.3 Forms

Typed reactive forms (`NonNullableFormBuilder`) built in `features/<f>/<f>.form.ts`, validated by
`zodValidator(schema)` from `shared/validators/`, which runs the generated zod request schema on the
group's value and writes issues onto the controls by path. `shared/components/form-field` renders
the label, the control slot, `aria-invalid` and `aria-describedby`; the toast reports the outcome
and never repeats a field error; a server field error for an unregistered path becomes a toast
(invariant 3). Signal Forms are not used in 1.0.0; the spike notes their status for a 1.x minor.

#### A2.4 Styling

The `styles/` tree is the only home of CSS (`angular.json`: `styles: ["src/styles/styles.scss"]`,
`stylePreprocessorOptions.includePaths: ["src/styles"]`). Components carry no `styles` or
`styleUrl`; `tests/unit/no-component-styles.spec.ts` asserts it. `setup/` emits no CSS and may be
`@use`d by a view partial; `basics/_base.scss` uses logical properties so `dir="rtl"` works;
breakpoints are Eitan's (`sm` 576, `md` 768, `lg` 1024, `xl` 1280, `xxl` 1536), mobile first, the
side-nav a drawer below `lg`; controls are 44 px on `pointer: coarse` whatever the density. One icon
set and one toast implementation per template (both the builder's pick, verified on the registry).
`AGENTS.md › Styling` states all of this.

#### A2.5 Flags

| Flag | Default | On | Off |
| --- | --- | --- | --- |
| `i18n` | true | Transloco, `he.json`, RTL, the language toggle, the HTTP loader, `/i18n` assets | the static translator over the bundled `en.json`; `dependencies.remove: ['@jsverse/transloco']` |
| `pwa` | true | manifest, icons, `provideServiceWorker`, update and install services, the initializer | the files under `onlyPaths` gone, the lines marked out; the build option stays (see above) |

A frontend manifest cannot declare `auth`; the account screens follow the server's flag through
`onlyWhen: { "server:auth": [...] }` and `// @server:auth` markers, as `react` does.

#### A2.6 Auth

`auth.interceptor.ts` sets `withCredentials` and, on a 401 while the session hint is set, awaits
one in-flight `authStore.refresh()` and replays the request once; the refresh request itself
carries an `HttpContext` token that exempts it. A refresh 400, 401 or 403 clears the hint and
routes to `/auth/login` with the attempted path (`next`). `auth.guard` is `canMatch` and returns a
`RedirectCommand`; `role.guard` reads `data.roles` and redirects to `/forbidden`. The user menu in
the header carries avatar, email, the theme toggle and sign out (invariant 7). The e2e auth journey
is `react`'s: register, sign in, see the profile, sign out, and a refresh that two concurrent 401s
trigger once.

#### A2.7 Tests and e2e

Unit: Vitest through `ng test` (Angular 22's default runner, jsdom). The template tests its own
glue once: the stores with `withRequestStatus`, each facade against `HttpTestingController`, the
interceptors (401 collapse, error mapping, loading count), the guards, the translator in both
modes, the theme service, the form validator, the shell nav, the `has-role` directive, the
`file-upload` progress and cancel, plus the tooling checks in `tests/unit/`.

E2E: Playwright with the `phone` and `desktop` projects, `shell.spec`, `screens.spec` from
`app/nav.ts` plus the auth screens, `smoke.spec`, `auth.spec`, `SIGNED_IN_ROUTES`, `retries: 0`.
The production build is served by `scripts/e2e-static.mjs`, a Node static server for `dist/` with
the SPA fallback and an `/api` proxy to the server's port, the counterpart of `vite preview`; the
server starts with `e2eDb && start` and `RATE_LIMIT_SCALE=100`; `E2E_BASE_URL` starts nothing.
The theme for a screen is forced through the `theme` key in `localStorage` before load, which
`theme-init.js` reads.

#### A2.8 Build and tooling

- `package.json` scripts: `dev` (`ng serve`, proxy), `build` (`ng build`), `typecheck`, `lint`
  (`eslint .`, angular-eslint for TypeScript and templates, the template a11y rules on), `format`
  and `format:check` (Prettier), `test` (`ng test` without watch), `test:e2e`, `api:types`
  (`openapi-ts`), `check` (typecheck, lint, format check, test). `typecheck` must cover templates
  under `strictTemplates`; whether that is `ngc` or a development `ng build` is the builder's,
  measured in the spike.
- `angular.json`: `cli.analytics: false`; `outputPath: { base: "dist", browser: "" }` so
  `dist/index.html` sits at the root (invariant 9); `assets` copies `public/` and the translations
  to `/i18n`; `fileReplacements` for `environment.prod.ts`; `serviceWorker` in production.
- Angular emits hashed files at the `dist` root (`main-HASH.js`, `chunk-HASH.js`,
  `styles-HASH.css`) and `media/`. The nginx config caches those immutable and keeps `index.html`,
  `ngsw.json`, `ngsw-worker.js` and the manifest revalidated. In `single` mode both servers' static
  middleware marks only `assets/` immutable, so Angular's bundles get the shell policy: correct, a
  revalidation per load. A hash-pattern rule in both servers is a follow-up minor.
- `Dockerfile`: a `node:24-alpine` build stage with the `bun` binary copied from
  `oven/bun:1.4-alpine` (the Angular CLI runs on Node; `bun install --frozen-lockfile` and
  `bun run build` drive it), then `dist` (`FROM scratch`) and `serve` (nginx-unprivileged) as in
  `react`.
- `bun run` honours `ng`'s Node shebang; CI has Node 24 and Bun 1.4. Spike S2 proves it on
  Windows and Linux.
- `template.yaml`: `runtime` node 24, `tools` bun 1.4 and node 24, `commands` as `react`'s,
  `static: { out: dist }`, `http: { port: 4200, health: / }`, `gitignore: [node]` plus an
  `angular` section if the CLI leaves files the node fragment misses, `defaultStack:
  angular-bun-express`, `onlyWhen` for `server:auth` and `server:database`, `postGenerate:
  [install, contract, format]`.

### A3. The harness goes layer-agnostic

The harness's generic texts stop naming React layers and point at the package's `AGENTS.md`.
Files and the change, for plan 019:

| File | Today | Becomes |
| --- | --- | --- |
| `AGENTS.md › Architecture`, frontend bullets | the five React layers; `shared/api/generated/` and who imports it | "layers, import direction and where an addition goes are the package's `AGENTS.md`; lint enforces the direction"; "the typed client comes from the contract into the directory the agents file names; only the data layer it names imports its runtime" |
| `AGENTS.md › Stack`, scaffolder line | `except bunx shadcn@4.21.4 add <name>` | "except a scaffolder the package's `AGENTS.md` names"; the pin moves to the React and Next agents files |
| `.claude/rules/naming.md` | "Frontend layers are singular", the three React layers | layer names follow the package's `AGENTS.md`; a slice is named for the glossary term it serves |
| `.claude/skills/api-design/SKILL.md` | `entity/<noun>/server|api/<noun>.ts` | "the entity's data layer and the feature's, at the paths `AGENTS.md › Adding a feature` names" |
| `.claude/agents/frontend.md` | `Slices: <entity/, feature/, widget/>`, the shadcn line | `Layers touched:`; the scaffolder sentence as above |
| `.claude/skills/bootstrap-project/SKILL.md` | "React today", `widget/system-status` | "a single-page app (React, Angular)"; "the health screen" |
| `.claude/skills/writing-plans/{SKILL,template}.md` | the React layer paths as plan step examples | generic wording with "see the package's `AGENTS.md`" |
| `.claude/skills/database/data-layer-task.md` | `frontend/<next\|react>/base/` | `frontend/<id>/base/` |
| `.doc/glossary.md` | "Features are named by actions", `feature/<action>` in Used as | "a frontend slice is named as its package's `AGENTS.md` says: React and Next features are actions (`feature/<action>`); Angular features mirror the server's modules (`features/<noun>`), so a frontend module shares the server module's noun"; the glossary still lists each action beside the nouns |
| `.claude/skills/ui-design/SKILL.md` | the React pattern names (`Page`, `PageHeader`, `EmptyState`, `ErrorState`, `ListSkeleton`, `AuthCard`, `FormActions`), `shared/ui/form`, `max-w-xl` | the page patterns stay; one sentence says the component names are the React and Next ones and that a package's `AGENTS.md › Styling` lists its equivalents (Angular: `shared/components/` `page-header`, `empty-state`, `error-state`, `skeleton`, `form-field`, `form-actions`, `auth-card`); `max-w-xl` becomes "the form width the package's styling sets" |

The `writing-tests`, `error-handling` and `code-review` skills name no layer and need nothing.
`scripts/provenance.test.mjs` uses `frontend/react` as fixture data and stays. `catalog.lock`
moves to the release of A4 in its own pull request, as every lock bump before it. The Angular
agents file names its pattern components with the same vocabulary the `ui-design` rubric uses, so
QA's rubric reads unchanged.

Cost: the harness's own words become less concrete; the concreteness now lives in each package the
agent is standing in, which is where the frontend agent reads anyway.

### A4. Stacks, cases, release

- Stacks `angular-bun-express` and `angular-python-fastapi`; `index.yaml` entries; the README
  matrix through `validate --readme`.
- `tests/cases.yaml`: `default` (bun-express, single, `withApp`), `split` (`withApp`), `python`
  (python-fastapi, single, `withApp`), `alone`, `auth-off`, `postgres` (the `e2eDb` chain and
  `scripts/e2e-database-url.ts`, run with `--with-services`), `i18n-off`, `pwa-off`, `flags-off`
  (both off), `brand` (non-default brand values through every gate).
- Release: catalog `v1.6.0`, a minor (a template added, the conventions amended, no existing
  template's files move). `frontend/angular` 1.0.0; `react` and `next` 2.1.2 only if A1's
  presence check adds a sentence to their agents files. Then the harness lock bump.
- Proof the harness owns: a bootstrap of `angular-bun-express` from the harness in a disposable
  clone and one dev-loop task on it (plan 019's proof step), so the layer-agnostic wording and the
  Angular agents file are seen by the role agents once before the release.

## Alternatives considered

- **Bend Angular to the React layer map.** Rejected by Eitan on 2026-11-06: structures are per
  framework. It would have kept one vocabulary and zero harness edits.
- **Markers in `angular.json`.** The Angular CLI reads its workspace file with a JSONC parser, so
  `// @pwa` lines may be legal. Not relied on in 1.0.0; spike S4 checks it and a later minor can
  move `serviceWorker` behind a marker and drop the dependency when the flag is off.
- **Two template variants per string for `i18n`.** Rejected: every component template would carry
  an `@i18n` and an `@noi18n` block. The translator indirection costs one abstract class and one
  impure pipe.
- **TanStack Angular Query instead of stores.** Eitan asked for stores; a product that needs a query
  cache adds it by plan.
- **`ng generate` as the allowed scaffolder.** The recipe in `Adding a feature` covers a new module
  file by file; a scaffolder would scatter files against the layer map. None is allowed.
- **Tailwind in Angular.** Rejected: the SCSS tree is the rule for every SPA.
- **Angular Material.** Rejected: its styling fights the global tree; the CDK alone gives the
  behaviours (overlay, focus trap, menu, dialog) without a look.
- **`tests/unit/` for everything, or co-location for everything.** Co-location is the Angular
  idiom and `ng test`'s default; the tooling checks test files outside `src/`, so they stay in
  `tests/unit/` and join the same runner.

## Consequences

- The catalog carries two frontend vocabularies and will carry three; the harness carries none.
- `docs/conventions.md › Frontend` is the invariants list of A1; the React and Next agents files
  are the only place their shape is written. A convention change about structure is a template
  change.
- The dev loop's frontend agent, QA and reviewer read the package's `AGENTS.md` for layer names;
  the UI rubric, the screens checks and the brand pipeline are unchanged.
- The Angular package pins TypeScript 6.0 (Angular 22's peer range), while `react` and `next`
  stay on 5.9 for typescript-eslint; per package, so no conflict.
- Hey API's Angular client is a beta plugin documented against Angular 20. Spike S1 decides the
  client; the fallback (below) keeps the generated SDK and moves the interceptors into the fetch
  client.

## Out of scope

Vue. React's restructure and Redux with RTK Query (ADR 0007). Next on the SCSS tree (ADR 0008).
Angular SSR (`@angular/ssr`). Angular Material. Per-feature Transloco scopes. An offline mutation
queue (the template only refuses mutations offline). Push notifications. The hash-pattern immutable
rule in the servers' static middleware. Dropping `@angular/service-worker` when `pwa` is off.

## Spikes (throwaway, before the plan's build steps)

- **S1. The client.** `@hey-api/openapi-ts` 0.99 with `@hey-api/client-angular`, the flat SDK and
  zod 4 against `bun-express`'s `openapi.json` under Angular 22: it generates, compiles under
  `strictTemplates`, and a request passes through a functional interceptor. Record the SDK's return
  type (Observable or Promise). Fallback if it fails: `@hey-api/client-fetch` wrapped by the facades
  with `from()`, and the auth, error and loading behaviours as fetch-client interceptors, as
  `react`'s `client.ts` does.
- **S2. Bun drives the Angular CLI.** `bun install --frozen-lockfile`, `bun run build`,
  `bun run test` (`ng test`, with a `tests/unit/*.spec.ts` under `// @vitest-environment node`)
  on Windows and in the Linux CI image. Record the `typecheck` mechanism and its time.
- **S3. Brand tokens in SCSS.** The generator substitutes `.scss` (already a marker type); sass
  compiles the result; the `brand` case passes the contrast checks with the `data-theme` selector.
- **S4. `angular.json` and comments.** Does Angular 22's CLI accept `//` comments in the workspace
  file? Informs the `pwa` simplification above; does not block 1.0.0.
- **S5. Signal Forms.** Their stability in Angular 22 and whether `validateStandardSchema` takes the
  generated zod schemas. Informs a 1.x minor; 1.0.0 uses reactive forms.

## Left to the builder

The recipe text under `Adding a feature`; the nginx config; `scripts/e2e-static.mjs`; the
restricted-elements mechanism; the exact unit test list beyond A2.7; the icon set and the toast
component; the health page's composition against the `ui-design` rubric; the translation keys and
the Hebrew copy; the `.env.example` content (the package reads no runtime environment); the
`angular` gitignore section if needed; the manifest and icon set for the `pwa` flag.

## Versions (registry, 2026-11-06; re-verify at build, never from memory)

| Package | Version | Note |
| --- | --- | --- |
| `@angular/core`, `@angular/service-worker` | 22.2.4 | peers TypeScript `>=6.0 <6.1` |
| `@angular/cli`, `@angular/build`, `@angular/cdk`, `@angular/pwa` | 22.2.6 | |
| TypeScript | 6.0.x | typescript-eslint peers `<6.1.0` |
| ESLint | 10.x | angular-eslint 22.6.0 peers `^9 \|\| ^10`; eslint-plugin-boundaries 7.4.2 peers `>=6` |
| `@ngrx/signals` | 22.0.1 | peers `@angular/core ^22` |
| `@jsverse/transloco` | 8.4.0 | peers `@angular/core >=16` |
| `@hey-api/openapi-ts` | 0.99.0, pinned exactly | 0.x; the Angular client is a bundled plugin, beta |
| `zod` | 4.6.x | |
| `@playwright/test` | 1.65.0 | |
| Vitest, jsdom | as `ng new` 22.2 pins them | |
