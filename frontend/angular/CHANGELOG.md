# Changelog

## 4.1.0 — 2026-11-12

One way for a store to call the API, one way for a form to submit, and a refresh decided by the server's answer instead of a list of URLs. No file moves; a project generated from 4.0 keeps its stores. Needs a server that sends the 401 challenge: bun-express 3.1.0 or python-fastapi 2.1.0.

### Changed

- `store/with-request-status.ts`: `withRequestStatus({ store, calls })` keeps a status per named call (`loading('save')`, `loaded`, `failed`, `error`) and adds `_call`, which runs a service call and resolves to an `Outcome` (`models/api/type.ts`; `DROPPED` and `ApiFailure` beside it). It logs, toasts once (`overrides`, `form`, `silent`), refuses a `mutation` offline, and lets the latest call of a name win, so a stale answer, or one in flight at `_resetCalls()`, is dropped. `setLoading`, `setLoaded` and `setError` are gone, and every store's own `fail` and offline helpers with them.
- `AuthStore`, `UserStore`: on `_call`; methods resolve to an `Outcome` instead of a boolean, and `AuthStore.restoring()` is `loading('restore')`. Sign-in, a code request and a verification no longer share one `loading()`.
- `store/session.store.ts` (new, with auth): the session hint, read once at start as `active()`, and the one shared refresh (`'renewed' | 'refused' | 'failed'`), moved out of `AuthStore`. `AuthStore.user()` shows the account only while the session is active, so a refused refresh hides it without code of its own.
- `core/interceptors/auth.interceptor.ts`: refreshes on a 401 that carries `WWW-Authenticate: Bearer` (the server's access-token gate) and never on the refresh itself. `EXEMPT_PATHS` is gone; a gated OTP call now refreshes like any other.
- `core/providers/form-submit.ts` (new): `injectFormSubmit(form)` sends nothing for an invalid or pending form, exposes `pending()`, and puts `validation_failed` on the fields with one toast for unmapped paths. Login, signup, verify-otp and profile use it in place of their copied blocks.
- `openapi-ts.config.ts`: the Angular client plugin sets `throwOnError: true`, so the facades no longer repeat it per call; `generated/` regenerated.
- `AGENTS.md`: the store step, the account-data rule, the form recipe, the session hint and the 401 rule describe the above.

## 4.0.0 — 2026-11-12

The folder rules of the owner: `models/` holds only entity files, there is one `components` folder, the form controls live together, and a component of several files is a folder named for it. Markup, class names, selectors, copy, routes and behaviour do not change. A project generated from 3.x keeps its tree; there is no migration tool.

### Breaking

All paths are under `src/app/`.

| What | Before | Now, and what a project generated before does |
| --- | --- | --- |
| App chrome | `components/app-<name>/` | `layout/app-<name>/` (`app-main-layout`, `app-auth-layout`, `app-account-menu`, `app-theme-toggle`, `app-language-toggle`, `app-install-button`, `app-install-hint`). The lint element is `layout`; its message reads `layout/ imports core/, store/, shared/ and models/`. An old project keeps `components/`. |
| Form controls | `shared/components/{input,textarea,checkbox,select,form-field,form-actions}/` and `shared/components/controls.scss` | `shared/components/form/<name>/` and `shared/components/form/controls.scss` (`styleUrls: ['../controls.scss']` is unchanged). |
| Confirm dialog | `shared/components/modal/confirm-dialog.component.*` | `shared/components/confirm-dialog/` (a component of several files is a folder named for it); `modal/` keeps the modal, its service and its tokens. |
| Page components | `pages/<module>/components/<name>/` (no template page used it) | A folder inside the page's folder, `pages/<module>/<page>/<name>/`. The lint element `page-components` matches `pages/*/*/*`; its rule (shared and models only) is unchanged. |
| `models/user/constants.ts` | `constants.ts` | `constant.ts` (the four file names are `interface.ts`, `type.ts`, `enum.ts`, `constant.ts`). |
| `models/user/interface.ts` | Re-exports of the generated types | `models/user/type.ts` (they are `type` re-exports; `Role` sits beside them). Importers read `@app/models/user/type`. |
| `models/notification/interface.ts` | `Toast`, `ToastAction` and the `ToastKind`, `ToastParams` aliases | The interfaces stay; the aliases are in `models/notification/type.ts`. |
| `models/api/response.ts` | The error types, `ApiError`, `isApiError()`, `Paginated<T>` | The types are `models/api/type.ts` and `models/api/interface.ts` (`ApiErrorInit`); `ApiError` and `isApiError()` are `services/api-error.ts`; its cases are `services/api-error.spec.ts`. |
| `models/api/error-copy.ts` | The code table and `errorMessageKey()` | The table is `ERROR_CODES` in `models/api/constant.ts`; `errorMessageKey()` is `core/config/error-copy.ts`, because a store and a page both read it. Its spec moved with it and imports the table. |
| `shared/validators/server-errors.ts` | Took an `ApiError` | Takes `{ fieldErrors? }`, so `shared/` imports nothing from `services/`; every caller still passes an `ApiError`. |
| Sign-up endpoint and flow names | `POST /api/auth/register`, `postApiAuthRegister`, `AuthService.register()`, `AuthStore.register()`, `registerForm()`, `RegisterComponent` (`app-register`), `pages/auth/register/`, `/auth/register`, `auth.register.*` and `auth.login.registerLink` keys, `.register__*` classes | `POST /api/auth/signup`, `postApiAuthSignup`, `signup()`, `signupForm()`, `SignupComponent` (`app-signup`), `pages/auth/signup/`, `/auth/signup`, `auth.signup.*` and `auth.login.signupLink` keys, `.signup__*` classes. The generated client is regenerated from the new contract; the copy does not change. A project generated before keeps the old names. |

### Changed

- `template.yaml`: the `i18n` and `pwa` flag paths and the `server:auth` paths read `layout/`; `onlyWhen: server` lists `services/api-error.*` and `core/config/error-copy.*` beside `models/api`.
- `eslint.config.mjs`: the element `components` is `layout`; `page-components` matches a component folder inside a page folder.
- `tests/unit/eslint-boundaries.spec.ts`, `tests/unit/component-styles.spec.ts`: re-pathed; every rule keeps one refused and one allowed case. The "no layer claims it" case now refuses `src/app/components/`.
- `AGENTS.md`: the layer list, the "Where does X go" and import tables, the models, error-envelope, shell, shared-sheet and test paragraphs name the new paths and the models rule.
- zod behind one facade, `shared/utils/validation.ts` (`text`, `number`, `literal`, `object`, `field`, `pick`, `either`, `check`, `validate`, the types `Schema`, `Input`, `Output`, `Issue`, `IssueKind`, `Result`). `shared/validators/zod.validator.ts` is `schema.validator.ts`; `zodValidator` is `schemaValidator` and reads the facade's `validate` result; the control error key `zod` is `schema` (`errors.schema`), `ZodErrorValue` is `SchemaErrorValue`. No file but the facade calls a method on a schema (`user.form.ts`, `auth.form.ts` and the specs go through it). A project generated before keeps `zod.validator.ts` and `errors.zod`.
- `eslint.config.mjs`: `no-restricted-imports` refuses `zod` outside `shared/utils/validation.ts`; a `*.form.ts` may import that one file. `tests/unit/eslint-boundaries.spec.ts` has a refused case (page, form, services, validators) and an allowed one (the facade).
- `AGENTS.md`: the form recipe and import tables name `schemaValidator` and the facade; an "External libraries" rule lists the facades.

### Tests

- New `tests/unit/folders.spec.ts`: every file under `models/` is `<noun>/(interface|type|enum|constant).ts`; two files of one stem in `layout/`, `shared/components/`, `pages/` or `app/` sit in a folder of that name; no `components/` folder exists outside `shared/`. Each rule has a seeded refused and allowed case.
- `error-copy.spec.ts` (the code table and `errorMessageKey()`) and `api-error.spec.ts` (`ApiError`, `isApiError()`) are the two halves of the old `models/api/error-copy.spec.ts`; no test is deleted, skipped or focused.

## 3.1.0 — 2026-11-11

The template generates correctly without a server ([ADR 0011](../../docs/adr/0011-frontend-without-a-server.md)). A generation with a server is unchanged except for the dev proxy file (below).

### Gated on `server`

- `onlyWhen: server`: `openapi-ts.config.ts`; `core/config/api-client.ts` and `api-client.provider.ts`; `core/interceptors/error.interceptor.ts` and its spec; `models/api/` (the error envelope, `error-copy` and their specs); `services/generated/`; `services/file-upload.service.ts` and its spec; `shared/validators/server-errors.ts` and its spec; `store/with-request-status.ts` and its spec. Dependency `@hey-api/openapi-ts` and script `api:types` go with them.
- `@server` markers: `provideApiClient()` in `app.config.ts`; `errorInterceptor` in `http.provider.ts` and its spec; the API lines of `.env.example`, `nginx/default.conf` and `app-config.token.ts`; the API web server, the proxy and the `/api` stub of the e2e static server (`scripts/e2e-static.mjs`) and its unit spec; the API web server of `playwright.config.ts`; the `GET /api/health` test of `smoke.spec.ts`.
- In `tests/unit/e2e-static.spec.ts` the stub API and the proxy tests are gated with the proxy; the rest (static serving, SPA shell, traversal refusal, 405) runs alone. No test is deleted.

### Changed

- `AGENTS.md`, gated or reworded for a lone project (a stack's file is unchanged except for the proxy file name): the generated client in the layer map, the import table (`services/`, forms over the generated schemas, `models/`) and rules, the "A read or write on a server module" row, the relative `/api` paragraph, the worked example of "Adding a feature" (contract, models, service, store and page snippet), the guard, session hint and form recipe paragraphs, the whole `Errors` envelope, the facade test bullet, the API web server of the e2e modes, the `smoke.spec` health sentence, and the Deployment lines on `/api`, the proxy, the deploy modes, the Compose fragment, `TRUST_PROXY`, cookies and body size. A noserver line replaces each where a reader needs one.
- The dev proxy is `proxy.conf.mjs` (was `proxy.conf.json`): JSON cannot carry a marker, and `angular.json` names the file, so without a server the file stays and exports `{}`. `ng serve` works alone; with a server the proxy is the same `/api` entry. A project generated from 3.0.0 keeps `proxy.conf.json`.

### Tests

- Cases: `alone` runs its e2e without a server; `alone-lean` is the same with `i18n` and `pwa` off.

### Kept without a server

`ngsw-config.json` (`navigationUrls` excludes `/api/**`; a JSON file cannot be gated, and the entry is harmless), the `errors.*` keys of the Transloco files and the lint rules and their specs for `services/generated/` (they guard a folder that arrives with a server).

## 3.0.0 — 2026-11-11

No template chrome and no example screen ([ADR 0010](../../docs/adr/0010-no-chrome-no-example-screen.md)). A generated app is a skip link, one `main` and an index route of one `h1` and one line of copy. A project generated from 2.x keeps its header, footer, side nav and status page as its own code; there is no migration tool.

### Breaking

All paths are under `src/`.

| What | Before | Now, and what a project generated before does |
| --- | --- | --- |
| Main layout | `app-main-layout` rendered the skip link, `app-header`, `app-side-nav`, `main` and `app-footer` in a grid, with the drawer state | The skip link and the one `main`, nothing else. Header, navigation and footer are product code: a component in `app/components/app-<name>/` that the layout renders between the skip link and `<main>` (`AGENTS.md › The shell`). An old project keeps its header and drawer as its own components. |
| `app/components/app-header/`, `app-footer/`, `app-side-nav/` | The chrome | Deleted, with `.shell*` in `styles/basics/_layout.scss`, `$side-nav-width` and the `drawer` z-indexes. The drawer's `model()` leaves with the side nav (ADR 0009 C3). |
| Components for the product to place | The theme, language, install and account controls were inline in the header | Extracted, each with a unit test and rendered by no template file: `app-theme-toggle/`; with auth `app-account-menu/`; with `i18n` `app-language-toggle/`; with `pwa` `app-install-button/` (the toolbar button) and `app-install-hint/` (the iOS hint, a full-width dismissible row). The gated ones are listed in `template.yaml` (`onlyWhen: server:auth`, the flags' `onlyPaths`). |
| Page container | `.main` carried the width limit, the gutters and the compact padding | `main` has no width and no padding; `shared/components/page/` (`app-page`) owns them (`:host` and `:host-context([data-density='compact'])`). The layout's host is a column at least `100dvh` high and `.main` (now in the layout's own stylesheet, no longer a global rule) takes the rest, so a full-bleed screen fills the viewport (`shell.spec`: main reaches the bottom of the viewport on a short page). The not-found, forbidden, profile and index pages wrap their template in it; a page without it is full-bleed. An old project that adopts `app-page` must drop the container from its `.main`, or the two stack. |
| Example screen | `pages/health/`, `services/health.service.ts`, `store/health.store.ts`, `models/health/`, the `health.*`, `shell.*` and `nav.open`, `nav.close`, `nav.primary` keys and the `api` data group of `ngsw-config.json` | Deleted. The index route is `pages/home/` (route file, page, stylesheet): the display name as its one `h1` and `home.description` ("Replace this page with the first screen."); it calls no API. The server keeps `/api/health` for deploy probes. The service worker caches no API answer. |
| Auth layout | The brand link, the card and `app-footer` | The footer went with `app-footer`; the brand link and the centred `main` stay. |
| Sign out | The header's account menu, and the profile page's button | The profile page's button only (it was already there); `app-account-menu` stays as a component for the product to place. |
| `AGENTS.md` | The health files were "the worked example" | `Adding a feature` is a code block per step (models, service, store, page and route) over the server's `module` endpoints, and a paragraph, "The shell"; the layer list and `Styling` name the components the product places. |
| e2e | `shell.spec.ts` asserted the landmarks, the drawer and the theme toggle; `smoke.spec.ts` anchored on the status and Refresh; the auth journeys read the account menu | See the pairs below. `expectTouchTargets(page, minimum, count)` takes the exact number of controls and `isPhone` is gone; `openAccountMenu` is gone, `expectSignedIn` (the profile page names the account) replaces it; `signOutThroughUi` keeps its signature but goes to `/profile`. |

### Changed

- `tests/unit/eslint-boundaries.spec.ts` invents `pages/post` where it named the health module; every case is the same.
- The global `.container` helper and its compact rule, and `$header-height`, are gone; `app-install-hint` carries its own inline padding. `pages/home/home.routes.ts` has a default export, like the other route files.
- `auth.interceptor.spec.ts` drives its requests through `UserService.me()` (`/api/user/me`) where it used `HealthService`; every case is the same.
- The translator, notification, toast and data-table specs use other keys as sample copy where they used `shell.footer` and `nav.*`; the assertions are the same.

### Assertions and their successors

No assertion is dropped without a successor; nothing is skipped or focused.

| Dropped | Now covered by |
| --- | --- |
| `shell.spec`: the page has the header, a Primary navigation, `main` and the footer, as banner, main and contentinfo landmarks | `shell.spec`: exactly one `main` with id `main`; `app-main-layout.component.spec.ts`: skip link first, one `main`, no banner, navigation or contentinfo landmark. The header, navigation and footer are gone with ADR D1. |
| `shell.spec`: an unknown URL renders not-found inside the shell, banner visible | `shell.spec`: an unknown URL renders not-found inside `main` |
| `shell.spec`: every control is a 44 px target on the home screen and with the drawer open, also at compact density | `shell.spec` `@phone`: the 404's control (exactly one) is a 44 px target, also at compact density (the controls it measured, and the drawer, are gone with ADR D1 and D3) |
| `shell.spec` `@desktop`: compact tightens spacing, the Refresh button keeps 40 px, `main`'s padding shrinks | `shell.spec` `@desktop`: compact tightens the page container's padding (`app-page`, ADR ruling R8) and the 404's home control keeps 40 px in both densities. Refresh is gone with ADR D3. |
| `shell.spec`: the theme toggle switches to dark and the choice survives a reload | The write: `app-theme-toggle.component.spec.ts` proves the control asks `ThemeService` for the next theme and announces it, and `theme.service.spec.ts` proves the choice is stored. The read: `screens.spec.ts` stores a theme before the page loads and asserts `data-theme` after it, so a stored choice is applied on load. The reload round trip itself is no longer asserted end to end. |
| `smoke.spec`: the home screen reaches the API and shows its status; Refresh asks the API again | Gone with the example screen (ADR D3). `smoke.spec`: the index route is one `h1` inside `main` and passes axe, and `/api/health` answers through the page's origin. The index page's copy is proven by `home.component.spec.ts`, which a product replaces with the page. |
| `auth.spec`: sign-up lands on the status screen with the account menu open and no Sign in link | `auth.spec`: sign-up lands on the index route (its `h1` is the display name) and `expectSignedIn` finds the account on `/profile`; `app-account-menu.component.spec.ts` covers the visitor's Sign in link and the menu |
| `auth.spec`: sign-in opens the account menu and follows its Profile link; the profile's Sign out shows the Sign in link and no menu | `expectSignedIn` and `signOutThroughUi` (the profile's button, then home, then `/profile` redirects to sign-in); `profile.component.spec.ts` runs sign-out from the button |
| `auth.spec`: two calls that expire together share one `/api/auth/refresh` (two Refresh clicks) | `auth.interceptor.spec.ts`: "collapses two concurrent 401s into one refresh and replays both requests once". The browser-level journey is no longer asserted end to end: the Refresh button that fired the two calls is gone with ADR D3. |
| `app-header.component.spec.ts`: the brand, the offline badge, the navigation toggle | Gone with the header (ADR D1). The theme, language, install and account tests moved to the specs of `app-theme-toggle`, `app-language-toggle`, `app-install-button`, `app-install-hint` and `app-account-menu`. |
| `app-side-nav.component.spec.ts`, `app-footer.component.spec.ts`; the NAV links, the drawer and the `lg` listener tests of `app-main-layout.component.spec.ts` | Gone with the side nav, footer and drawer (ADR D1) |
| `app-auth-layout.component.spec.ts`: has a footer | The auth layout has no footer; the spec asserts none, and no navigation |
| `health-badge`, `health-status`, `health.service` and `health.store` specs | Gone with the health slices (ADR D3) |
| `ngsw-config.spec.ts`: caches only the health check, freshness, `maxAge` 10 s, timeout 3 s | `ngsw-config.spec.ts` keeps its two guards (no `!` pattern in a data group; no group matches `/api/user/**` or `/api/auth/**`, through the glob helpers); they hold trivially with no data group and guard the product's first one. The `api` group and the assertions about it left with ADR D3. |
| `app.config.spec.ts`: the home path routes to the health feature | The home path routes to `HomeComponent` inside the layout |

## 2.0.0 — 2026-11-09

The template's tree on `pages/`, `components/` and co-located styles
([ADR 0009](../../docs/adr/0009-pages-components-colocated-styles.md)). A breaking move: the routed
pages sit in `pages/<module>/<page>/`, the app-wide components in `components/app-<name>/` with
`App` on the class, and every stylesheet beside the component or page that owns it, under emulated
encapsulation, on a global token tree in `src/styles/`. No behaviour changes except the additions
below. A project generated from 1.x does not upgrade in place: the table is the migration.

### Breaking

All paths are under `src/`. A file's spec and template move with it.

| Old path                                                                                                                                                | New path                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/layout/main-layout/main-layout.component.*`                                                                                                        | `app/components/app-main-layout/app-main-layout.component.*`                                                                                                   |
| `app/layout/auth-layout/auth-layout.component.*`, with auth                                                                                             | `app/components/app-auth-layout/app-auth-layout.component.*`                                                                                                   |
| `app/layout/components/header/header.component.*`                                                                                                       | `app/components/app-header/app-header.component.*`                                                                                                             |
| `app/layout/components/side-nav/side-nav.component.*`                                                                                                   | `app/components/app-side-nav/app-side-nav.component.*`                                                                                                         |
| `app/layout/components/footer/footer.component.*`                                                                                                       | `app/components/app-footer/app-footer.component.*`                                                                                                             |
| `app/features/health/pages/health-status/*`                                                                                                             | `app/pages/health/health-status/*`                                                                                                                             |
| `app/features/health/components/health-badge/*`                                                                                                         | `app/pages/health/components/health-badge/*`                                                                                                                   |
| `app/features/health/health.routes.ts`                                                                                                                  | `app/pages/health/health.routes.ts`                                                                                                                            |
| `app/features/not-found/pages/not-found/*`, `not-found.routes.ts`                                                                                       | `app/pages/not-found/not-found/*`, `app/pages/not-found/not-found.routes.ts`                                                                                   |
| `app/features/auth/pages/{login,register,verify-otp}/*`, with auth                                                                                      | `app/pages/auth/{login,register,verify-otp}/*`                                                                                                                 |
| `app/features/auth/auth.routes.ts`, `auth.form.ts` (+ spec), with auth                                                                                  | `app/pages/auth/` (same names)                                                                                                                                 |
| `app/features/user/pages/profile/*`, with auth                                                                                                          | `app/pages/user/profile/*`                                                                                                                                     |
| `app/features/user/user.routes.ts`, `user.form.ts` (+ spec), with auth                                                                                  | `app/pages/user/` (same names)                                                                                                                                 |
| `app/features/forbidden/pages/forbidden/*`, `forbidden.routes.ts`                                                                                       | `app/pages/forbidden/forbidden/*`, `app/pages/forbidden/forbidden.routes.ts`                                                                                   |
| `styles/components/_header.scss`                                                                                                                        | `app/components/app-header/app-header.component.scss`                                                                                                          |
| `styles/components/_side-nav.scss`                                                                                                                      | `app/components/app-side-nav/app-side-nav.component.scss`                                                                                                      |
| `styles/components/_footer.scss`                                                                                                                        | `app/components/app-footer/app-footer.component.scss`                                                                                                          |
| `styles/components/_auth-layout.scss`, with auth                                                                                                        | `app/components/app-auth-layout/app-auth-layout.component.scss`                                                                                                |
| `styles/components/_button`, `_spinner`, `_skeleton`, `_page-header`, `_empty-state`, `_error-state`, `_data-table`, `_form-actions`, `_icon` (`.scss`) | `app/shared/components/<name>/<name>.component.scss`                                                                                                           |
| `styles/components/_auth-card.scss`, with auth                                                                                                          | `app/shared/components/auth-card/auth-card.component.scss`                                                                                                     |
| `styles/components/_form-field.scss`                                                                                                                    | `app/shared/components/form-field/form-field.component.scss`                                                                                                   |
| `styles/components/_controls.scss` (`.control*`, `.checkbox*`)                                                                                          | `app/shared/components/controls.scss` (`styleUrls` of `input`, `select`, `textarea`) and `app/shared/components/checkbox/checkbox.component.scss`              |
| `styles/components/_modal.scss`                                                                                                                         | `app/shared/components/modal/modal.component.scss`, and `modal/confirm-dialog.component.scss` for `.modal__actions`                                            |
| `styles/components/_toast.scss`                                                                                                                         | `app/shared/components/toast/toast.component.scss`                                                                                                             |
| `styles/views/_health-status.scss`                                                                                                                      | `app/pages/health/health-status/health-status.component.scss`, and `app/pages/health/components/health-badge/health-badge.component.scss` for `.health-badge*` |
| `styles/views/_not-found.scss`, `_forbidden.scss`, `_profile.scss`                                                                                      | the page's `<page>.component.scss` beside its component                                                                                                        |
| `styles/views/_login.scss`, `_register.scss`, `_verify-otp.scss`, with auth                                                                             | `app/pages/auth/<page>/<page>.component.scss`                                                                                                                  |
| `styles/components/_index.scss`, `styles/views/_index.scss`                                                                                             | deleted; there is no forwarding index                                                                                                                          |
| none                                                                                                                                                    | `styles/setup/_layers.scss`: `@layer setup, themes, basics;`                                                                                                   |

- Renamed classes: `MainLayoutComponent` → `AppMainLayoutComponent`, `AuthLayoutComponent` →
  `AppAuthLayoutComponent`, `HeaderComponent` → `AppHeaderComponent`, `FooterComponent` →
  `AppFooterComponent`, `SideNavComponent` → `AppSideNavComponent`. The selectors are unchanged
  (`app-header`, `app-footer`, `app-side-nav`, `app-main-layout`, `app-auth-layout`). Page
  components and the shared components keep their names (`LoginComponent`, `ButtonComponent`).
- `AppSideNavComponent.open` is a `model(false)`; the `closed` output is gone. A caller binds
  `[(open)]` instead of `[open]` and `(closed)`.
- The rule: `src/styles/` holds `styles.scss`, `setup/`, `themes/` and `basics/` and nothing else,
  in cascade layers (`setup`, `themes`, `basics`). Each component and page names its sibling
  `<stem>.component.scss` in `styleUrl`; the sheet `@use`s `setup/...` only and is never layered.
  `ViewEncapsulation.None` and `::ng-deep` are refused, so a parent never restyles a child's
  interior: it styles the child's host (when the child is in its own template) or the child takes an
  input. `.form-actions .button`, `.user-menu__panel .button` and the CDK overlay's structural
  rules are gone from the sheets (the form actions rely on flex stretch, the menu rows use
  `app-button`'s new `block` input, the CDK loads its own overlay CSS).
- `app/layout/` and `app/features/` no longer exist; the boundaries lint knows `components`,
  `page`, `page-components`, `page-routes` and `page-form`.

### Added

- `ButtonComponent.block`: fills its container and aligns the label to the start (the account
  menu's rows).
- `AppSideNavComponent.open` as a `model()`, bound two-way by `app-main-layout`, with specs for the
  drawer closing itself and for the parent opening it.
- The owner scan in `tests/unit/component-styles.spec.ts` (renamed from `no-component-styles`):
  `src/styles/` has four entries, every stylesheet is referenced by its sibling component (or shared
  by two), references are `./x.scss` or `../x.scss`, no inline `styles:`, no `ViewEncapsulation.None`,
  no `::ng-deep`, `components/` folders carry `app-` and their classes `App`, the global partials are
  layered and no component sheet is; each rule has a seeded temporary-tree test.
- `boundaries/no-unknown-files`: a file in a directory no layer claims is an error (`main.ts` and
  `src/environments/` are boundaries-ignored).

### Changed

- The modal's pane and backdrop rules (`.modal__panel*`, `.modal__backdrop`) are in
  `styles/basics/_layout.scss`: the CDK builds both outside every view, so no component owns them.
  `ModalService` still sets `panelClass` and `backdropClass`; the modal's sheet keeps the dialog box,
  header and body.
- The boundaries lint messages say `components/`, `pages/` and "a page module"; the
  `pages/<module>/<page>` element is two levels deep so a module's `*.routes.ts` and `*.form.ts`
  are not also read as pages. `eslint-boundaries.spec.ts` gains the unknown-folder cases and the
  routes-to-form and form-to-page refusals.
- `AGENTS.md` describes the new tree, the two style homes, emulated encapsulation, the primary
  features in use and the zoneless app.
- The `server:auth` file list in `template.yaml` names the new paths.

## 1.0.0 — 2026-11-07

First release (ADR 0006).

### Added

- Angular 22 single-page app on standalone components and signals, with `@ngrx/signals` stores, a
  facade per server module over Hey API's generated Angular client, zod-validated typed forms and
  global SCSS in `src/styles/`.
- A layer map enforced by `eslint-plugin-boundaries`, with a lint test per rule.
- The shell: main and auth layouts, header, side-nav drawer, skip link, theme and density, and the
  shared components (button, form controls, modal, toast, data table and the state patterns).
- The `i18n` flag (default on): Transloco with English and Hebrew (RTL), a language toggle and a
  translation parity test.
- The `pwa` flag (default on): web manifest, icons, the Angular service worker, update and install
  prompts.
- Session glue behind the server's `auth` flag: HttpOnly-cookie session hint, guards, one refresh and
  one replay on a 401, sign-in, sign-up, OTP and profile screens.
- Playwright and axe e2e (shell, screens, smoke, auth), a dependency-free static server for `dist/`,
  and the `dist` and `serve` Docker targets with the `split` mode's nginx and Compose fragment.
