<!-- @server-start -->
The layer map of this package. Commands are in `package.json`; the contract code in `src/app/services/generated/` is generated, never edited.
<!-- @server-end -->
<!-- @noserver-start -->
The layer map of this package. Commands are in `package.json`.
<!-- @noserver-end -->

**`src/`**

- `main.ts`: `bootstrapApplication(AppComponent, appConfig)`, nothing else.
- `app/`: the files beside the folders are the wiring. `app.component.ts` (a `<router-outlet />`),
  `app.config.ts` (the providers), `app.routes.ts` (the two shells, one lazy `loadChildren` per page module,
  `**` to not-found) and `nav.ts` (the one navigation table; `NavEntry` lives in `models/nav/`, and
  `app.config.ts` hands the table to `layout/` through the `NAV_ENTRIES` token in `core/config/`).
  No business logic here.
  - `core/`: singletons wired once in `app.config.ts`, never imported by `shared/`.
<!-- @server-start -->
    `config/` (`constants.ts` with the `STORAGE_KEYS`, `api-client.ts` the generated client's
    configuration, `api-client.provider.ts` its provider, `app-config.token.ts`, `http-context.ts`),
<!-- @server-end -->
<!-- @noserver-start -->
    `config/` (`constants.ts` with the `STORAGE_KEYS`, `app-config.token.ts`, `http-context.ts`),
<!-- @noserver-end -->
    `interceptors/`, `guards/`, `initializers/`, `providers/` (storage, logger, notification,
    theme, network, loading, install-prompt and app-update; the last two with the `pwa` flag),
    `i18n/` (the translator binding in `translator.provider.ts`; with the `i18n`
    flag also Transloco's config, the HTTP loader, `language.service.ts` and `translations/he.json`),
    `errors/`.
  - `layout/app-<name>/`: the app-wide components, one folder each with
    `app-<name>.component.ts`, `.html`, `.scss` and `.spec.ts`: the two layouts (`app-main-layout`,
    `app-auth-layout`) and the components the product places in its own chrome, such as
    `app-theme-toggle` (see The shell). The class carries `App` (`AppThemeToggleComponent`), the
    selector is written out (`app-theme-toggle`). A component goes here when the product's shell
    composes it or it reads the store, the theme or the session; a reusable control or pattern goes
    to `shared/components/`.
  - `pages/<module>/`: one glossary noun or screen group, flat. `<module>.routes.ts`,
<!-- @server-start -->
    `<module>.form.ts` (typed form builders over the generated zod schemas), one folder per routed
<!-- @server-end -->
<!-- @noserver-start -->
    `<module>.form.ts` (typed form builders), one folder per routed
<!-- @noserver-end -->
    page, `<page>/<page>.component.*` (reads the store; its `.scss` beside it), and
    `<page>/<component>/` (the page's own presentational pieces, a folder named for each). A page module never imports
    another one. `home/` is the index route; `not-found/` is the `**` route.
<!-- @server-start -->
  - `store/`: `@ngrx/signals` stores, one per noun, and `with-request-status.ts`.
<!-- @server-end -->
<!-- @noserver-start -->
  - `store/`: `@ngrx/signals` stores, one per noun.
<!-- @noserver-end -->
<!-- @server-start -->
  - `services/`: one facade per server module over the generated SDK; `generated/` is the Hey API
    output (types, zod, the Angular client, the flat SDK; committed, lint-ignored).
<!-- @server-end -->
<!-- @noserver-start -->
  - `services/`: one facade per server module; the folder arrives with a server.
<!-- @noserver-end -->
  - `shared/`: product-agnostic. `components/` (the browser controls wrapped once, the form controls in `components/form/`), `directives/`,
    `pipes/`, `validators/`, `utils/`, `i18n/`.
<!-- @server-start -->
  - `models/`: a noun's types (re-exports of the generated types plus UI-only shapes), enums,
<!-- @server-end -->
<!-- @noserver-start -->
  - `models/`: a noun's types (UI-only shapes), enums,
<!-- @noserver-end -->
    constants, one folder per noun holding only `interface.ts`, `type.ts`, `enum.ts` and `constant.ts`;
    no function, copy helper or spec lives there.
<!-- @server-start -->
- `environments/`: `production` and nothing else (no API URL, no secret).
<!-- @server-end -->
<!-- @noserver-start -->
- `environments/`: `production` and nothing else (no secret).
<!-- @noserver-end -->
- `styles/`: global and app-wide CSS only: `styles.scss`, `setup/`, `themes/`, `basics/` (see Styling).

**No scaffolder.** Never run `ng new` or `ng generate` (or any other generator): they scatter files
against the layer map and default to suffix-less names. Write the files by hand,
copying the nearest sibling.

**Where does X go**

| Addition                                    | Home                                               |
| ------------------------------------------- | -------------------------------------------------- |
| A noun's types, enums, labels               | `app/models/<noun>/`                               |
<!-- @server-start -->
| A read or write on a server module          | `app/services/<module>.service.ts`                 |
<!-- @server-end -->
| State a page reads, and the methods on it   | `app/store/<noun>.store.ts`                        |
| A routed screen                             | `app/pages/<module>/<page>/`                       |
| A presentational piece of one page          | `app/pages/<module>/<page>/<name>/`                |
| A form                                      | `app/pages/<module>/<module>.form.ts`              |
| An app-wide component (header, menu)        | `app/layout/app-<name>/`                           |
| A reusable control, pattern or pipe         | `app/shared/`                                      |
| A guard, interceptor, initializer, provider | `app/core/`                                        |
| A navigation entry                          | `app/nav.ts`                                       |
| A component's or page's style               | a sibling `<stem>.component.scss` under `styleUrl` |
| A token, a theme value or a global rule     | `src/styles/` (`setup/`, `themes/`, `basics/`)     |

**Naming.** Files follow the Angular style guide before v20, not the suffix-less one:
`*.component.ts` with its template in an external `*.component.html` and its styles in a sibling
`*.component.scss` under `styleUrl` (never an inline `styles:`), `*.service.ts`, `*.store.ts`, `*.guard.ts`, `*.interceptor.ts`, `*.pipe.ts`,
`*.directive.ts`. The class carries the suffix (`AppComponent`, `LoginComponent`); a class in `layout/` also
carries `App` (`AppMainLayoutComponent`) while its selector and folder read `app-main-layout`.
Cross-layer imports use the alias `@app/*` (`src/app/*`); imports inside one page module or one
directory stay relative.

**Import rules** (`eslint-plugin-boundaries`; each lint message names the layer to use instead):

| From                                                        | May import                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `app/` files                                                | layout, pages (lazy routes only), core, store, shared, models                                      |
| `layout/`                                                   | core, store, shared, models                                                                            |
| `pages/<m>/<page>/`                                         | store, shared, models, `core/config`, `core/providers`, its own components and its module's `*.form.ts`   |
| `pages/<m>/<page>/<component>/`                             | shared, models                                                                                         |
| `pages/<m>/*.routes.ts`                                     | `core/guards`, its own pages                                                                           |
<!-- @server-start -->
| `pages/<m>/*.form.ts`                                       | `shared/validators`, `shared/utils/validation`, models, the generated zod schemas                      |
<!-- @server-end -->
<!-- @noserver-start -->
| `pages/<m>/*.form.ts`                                       | `shared/validators`, `shared/utils/validation`, models                                                 |
<!-- @noserver-end -->
| `store/`                                                    | services, models, `core/providers`, `core/config`                                                      |
<!-- @server-start -->
| `services/`                                                 | models, `core/config`, `services/generated`                                                            |
<!-- @server-end -->
| `core/guards`, `core/interceptors`, `core/initializers`     | store, services, core, shared, models (they are the wiring)                                            |
| `core/config`, `core/providers`, `core/i18n`, `core/errors` | each other, shared, models                                                                             |
| `shared/`                                                   | shared, models                                                                                         |
<!-- @server-start -->
| `models/`                                                   | models; the generated types with `import type` only                                                    |
<!-- @server-end -->
<!-- @noserver-start -->
| `models/`                                                   | models                                                                                                 |
<!-- @noserver-end -->

<!-- @server-start -->
- A page module never imports another page module. A page that needs a one-off request adds a service
  and a store method first.
<!-- @server-end -->
<!-- @noserver-start -->
- A page module never imports another page module. A page that needs shared state adds a store
  method first.
<!-- @noserver-end -->
<!-- @server-start -->
- `@angular/common/http` is imported only in `services/`, `core/interceptors/` and `core/config/`
  (`no-restricted-imports`). The generated client's runtime is imported only in `services/`, and by
  `core/config/api-client.provider.ts`, which hands it the `HttpClient`; `models/` and `core/config/`
  take its types with `import type`. `api-client.ts` (the generator's `runtimeConfigPath`) imports
  types only, because the generated client imports that file back.
<!-- @server-end -->
<!-- @noserver-start -->
- `@angular/common/http` is imported only in `services/`, `core/interceptors/` and `core/config/`
  (`no-restricted-imports`).
<!-- @noserver-end -->
- `<button>`, `<input>`, `<select>` and `<textarea>` appear only inside `shared/components/`;
  `tests/unit/restricted-elements.spec.ts` scans every template for them.
- The boundary rule is silent on an import it cannot resolve, so `eslint-import-resolver-typescript`
  reads the `@app/*` alias from `tsconfig.app.json`; keep the setting when the config changes.

`tests/unit/eslint-boundaries.spec.ts` lints one violation and one allowed case per rule, in a
throwaway project built from the real `eslint.config.mjs`. A new rule gets a case there.
`boundaries/no-unknown-files` is on: a file outside every layer in the table (a stray
`src/app/widgets/` folder) is an error; `main.ts`, `src/environments/` and the specs are
boundaries-ignored. The page layers are two levels deep (`pages/<m>/<page>/`), so a module's own
`*.routes.ts` and `*.form.ts` are matched by their rows, not read as pages.

<!-- @server-start -->
The API is always reached at relative `/api` on the page's own origin (see Deployment), so the
bundle carries no API URL.

<!-- @server-end -->
## Adding a feature

<!-- @noserver-start -->
This package was generated without a server. What arrives with one, and only through the
harness's `scripts/scaffold.mjs` (never a hand copy):

- the typed client, SDK and zod schemas in `src/app/services/generated/`, with `openapi-ts.config.ts`,
  the `api:types` script and `@hey-api/openapi-ts`;
- the client wiring (`core/config/api-client*.ts`, `provideApiClient()` in `app.config.ts`);
- the error envelope: `models/api/`, `error.interceptor.ts`, `server-errors.ts`,
  `with-request-status.ts` and `file-upload.service.ts`;
- the dev proxy's `/api` entry (`proxy.conf.mjs`, which `angular.json` names), the `/api` rules of
  the e2e static server and the nginx config, and the API web server and health journey of the e2e
  suite.

<!-- @noserver-end -->
<!-- @server-start -->
The data flows one way: **page -> store -> service -> generated SDK**. A page injects the store and
never a service or `HttpClient`; `@angular/common/http` appears only in `services/`,
`core/interceptors/`, `core/config/` and one named exception, Transloco's loader
`core/i18n/transloco-http.loader.ts` (the `i18n` flag; it marks its call `BACKGROUND`). The server's
`module` endpoints stand in for a product noun below; file by file:
<!-- @server-end -->
<!-- @noserver-start -->
A page injects the store and never `HttpClient`; `@angular/common/http` appears only in `services/`,
`core/interceptors/`, `core/config/` and one named exception, Transloco's loader
`core/i18n/transloco-http.loader.ts` (the `i18n` flag; it marks its call `BACKGROUND`). File by file:
<!-- @noserver-end -->

<!-- @server-start -->
1. **Glossary and contract.** Name the noun and the action in `.doc/glossary.md`. If the server's
   contract changed, run `bun run api:types` (the input is the server's `openapi.json`):
   `src/app/services/generated/` is regenerated and committed, never edited.
2. **Models.** `app/models/<noun>/interface.ts` re-exports the generated types (`import type`; a
   hand-written API shape is a lint error). `models/api/` holds the error types, `Paginated<T>` and
   `ERROR_CODES`; `services/api-error.ts` holds `ApiError` and `isApiError()`, and
   `core/config/error-copy.ts` holds `errorMessageKey()`.

   ```ts
   // app/models/module/interface.ts
   import type { Module, ModulePage } from '@app/services/generated/types.gen'

   export type { Module, ModulePage }
   ```

3. **Service.** `@Injectable({ providedIn: 'root' })`, one method per call, each returning the
   call's `data`. A failure rejects with the `ApiError` the interceptor built.

   ```ts
   // app/services/module.service.ts
   @Injectable({ providedIn: 'root' })
   export class ModuleService {
     async list(): Promise<ModulePage> {
       const { data } = await getApiModule({ throwOnError: true })
       return data
     }

     async create(body: CreateModuleBody): Promise<Module> {
       const { data } = await postApiModule({ body, throwOnError: true })
       return data
     }
   }
   ```

4. **Store.** A read is `patchState(store, setLoading())`, `await` the service,
   `patchState(store, { ... }, setLoaded())`; in the `catch` it `setError(error)`s and toasts
   `errors.<code>` once; a cause that is not an `ApiError` is first logged
   (`LoggerService.error`, as the block shows) and then shown as `errors.unknown`, so a
   bug is never silent. A mutation first checks `NetworkService.online()` and toasts `errors.offline`
   instead of sending, and returns whether it worked.

   ```ts
   // app/store/module.store.ts
   export const ModuleStore = signalStore(
     { providedIn: 'root' },
     withState<{ page: ModulePage | null }>({ page: null }),
     withRequestStatus(),
     withMethods(
       (
         store,
         service = inject(ModuleService),
         network = inject(NetworkService),
         notifications = inject(NotificationService),
         logger = inject(LoggerService),
       ) => {
         const fail = (cause: unknown): void => {
           if (!isApiError(cause)) logger.error('ModuleStore failed', cause)
           const error = isApiError(cause) ? cause : new ApiError({ status: 0, code: 'unknown' })
           patchState(store, setError(error))
           notifications.showError(errorMessageKey(error.code))
         }

         return {
           async load(): Promise<void> {
             patchState(store, setLoading())
             try {
               patchState(store, { page: await service.list() }, setLoaded())
             } catch (cause) {
               fail(cause)
             }
           },

           async create(body: CreateModuleBody): Promise<boolean> {
             if (!network.online()) {
               notifications.showError('errors.offline')
               return false
             }
             try {
               await service.create(body)
               return true
             } catch (cause) {
               fail(cause)
               return false
             }
           },
         }
       },
     ),
   )
   ```

<!-- @server-end -->
   <!-- @server:auth-start -->

   **Account data.** A store that holds an account's data (`UserStore` is the example)
   exposes `reset()` and clears itself with an `effect` on `AuthStore.isLoggedIn()` (`withHooks`
   `onInit`), so sign-out and a refused refresh leave nothing for the next account; its `load()`
   drops the old value before it calls, and ignores an answer that arrives after sign-out.

   <!-- @server:auth-end -->
<!-- @server-start -->

5. **Page module and route.** `app/pages/<module>/<module>.routes.ts` (the default export,
   lazy-loads the page) and `<page>/` (the routed page; injects the store; a skeleton while loading,
   `app-error-state` with retry on failure, the loaded view, all inside `<app-page>`). A lazy
   `loadChildren` in `app/app.routes.ts` inside the main shell mounts it; a top-level screen also
   gets an entry in `app/nav.ts` (`{ path: '/module', labelKey: 'module.title' }`).

   ```html
   <!-- app/pages/module/module-list/module-list.component.html -->
   <app-page>
     <app-page-header [heading]="'module.title' | t" />
     @if (store.failed()) {
       <app-error-state [description]="'errors.unknown' | t" (retry)="store.load()" />
     } @else {
       @for (item of store.page()?.items; track item.id) {
         <p>{{ item.name }}</p>
       }
     }
   </app-page>
   ```

   ```ts
   // app/app.routes.ts, inside the main shell's children
   { path: 'module', loadChildren: () => import('./pages/module/module.routes') },
   ```

6. **Styles.** A sibling `<stem>.component.scss` named in the component's `styleUrl`. BEM classes;
   no inline `styles:`.
7. **Copy** in `core/i18n/translations/en.json` **and `he.json`** (the `i18n` flag; the parity
   test `tests/unit/translation-parity.spec.ts` fails when a key or a `{{param}}` is missing from
   one): the page's keys, and the `errors.<code>` text for any new envelope code. Use every key
   through `t` and never branch on the flag.
8. **Specs** beside each file (see Tests): service, store, page, component.

<!-- @server-end -->
<!-- @noserver-start -->
1. **Page module and route.** `app/pages/<module>/<module>.routes.ts` (the default export,
   lazy-loads the page) and `<page>/` (the routed page; injects the store; a skeleton while loading,
   `app-error-state` with retry on failure, the loaded view, all inside `<app-page>`). A lazy
   `loadChildren` in `app/app.routes.ts` inside the main shell mounts it; a top-level screen also
   gets an entry in `app/nav.ts` (`{ path: '/module', labelKey: 'module.title' }`).

   ```ts
   // app/app.routes.ts, inside the main shell's children
   { path: 'module', loadChildren: () => import('./pages/module/module.routes') },
   ```

2. **Styles.** A sibling `<stem>.component.scss` named in the component's `styleUrl`. BEM classes;
   no inline `styles:`.
3. **Copy** in `core/i18n/translations/en.json` **and `he.json`** (the `i18n` flag; the parity
   test `tests/unit/translation-parity.spec.ts` fails when a key or a `{{param}}` is missing from
   one): the page's keys. Use every key through `t` and never branch on the flag.
4. **Specs** beside each file (see Tests): store, page, component.

<!-- @noserver-end -->
**The shell.** The template renders no header, navigation or footer: `app-main-layout` is the skip
link and the page's one `main`. A product's chrome is its own component in `layout/app-<name>/`
that the layout renders between the skip link and `<main>`; `app-theme-toggle` is ready to place
there, and `app/nav.ts` is the table a navigation reads (through the `NAV_ENTRIES` token, because
`layout/` may not import `app/`).

<!-- @server:auth-start -->

With the server's auth, `app-account-menu` is the sign-in link or the account menu to place beside
it; the profile page carries Sign out.

<!-- @server:auth-end -->

<!-- @i18n-start -->

With `i18n`, `app-language-toggle` is the language switch to place beside it.

<!-- @i18n-end -->

<!-- @pwa-start -->

With `pwa`, `app-install-button` is a toolbar control shown once the browser offers an install, and
`app-install-hint` is the iOS share-sheet hint, a full-width dismissible row of its own.

<!-- @pwa-end -->

**The framework features in use**, so a new page does not reinvent them: standalone components with
`input()` and `output()`, signals and `computed`,
`@ngrx/signals` stores, `viewChild`, `@if` and `@for`, `OnPush` everywhere, `toSignal`,
`afterNextRender`, the CDK overlay and dialog. The app is zoneless (Angular 21+ default): there is
no `zone.js` polyfill and no `provideZoneChangeDetection`; state that a template reads is a signal.
`@defer` is for a non-landmark block whose first paint can wait; the template has none, because its
one candidate, the toast, is a CDK overlay portal. `linkedSignal` is for local state that must reset when an input changes; the template
has none (the controls keep no such state), so none is used. Not used, on purpose: `resource` and
<!-- @server-start -->
`httpResource` (the data path is page, store, service, SDK, one path) and Signal Forms.
<!-- @server-end -->
<!-- @noserver-start -->
`httpResource` and Signal Forms.
<!-- @noserver-end -->

<!-- @server-start -->
**Guarding a route (the server's `auth` flag; the files exist only then).** `core/guards/` holds
`authGuard` (a `CanMatchFn`: a visitor is redirected, with a `RedirectCommand`, to
`/auth/login?next=<attempted path and query>`), `guestGuard` (login and signup: an account goes
home) and `roleGuard`. Put them on the route in the module's `*.routes.ts`:
`{ path: '', canMatch: [authGuard], loadComponent: ... }`, and for a role
`{ canMatch: [roleGuard], data: { roles: ['admin'] }, ... }` (a visitor goes to login, another role to
`/forbidden`). A guard only keeps a visitor off a screen; the API decides on every call. In a template,
`*appHasRole="'admin'"` (or an array) renders a control only for an account holding the role: it
reads the `ROLES` token in `shared/directives/has-role.directive.ts`, which `app.config.ts` fills from
`AuthStore.roles` (empty without auth), and a `NavEntry.roles` list lets a navigation filter its entries the same way.
A page with edits to lose implements `hasUnsavedChanges()` and adds
`canDeactivate: [unsavedChangesGuard]` (a confirm dialog). The login page reads `next` from the
query string through `safeNextPath` (`shared/utils/next-path.ts`): only a path on this site is
followed, anything else is `/`.

**The session hint.** The session is two HttpOnly cookies; JavaScript never holds a token.
`AuthStore` keeps a flag (`STORAGE_KEYS.session`, the value `'1'`, through `StorageService`): "this
browser signed in". With the flag, start-up reads `GET /api/user/me` (`session.initializer.ts`) and a
401 may trigger a refresh; without it a visitor's page load calls neither. A login or signup sets
it, a sign-out or a refused refresh clears it, and a network error or an outage keeps it. Never store
anything else under it, and never branch on it outside the auth store and interceptor.

**The form recipe, by example.** `pages/auth/auth.form.ts` is the pattern: one function per form
(`loginForm()`, `signupForm()` with a `match('password', 'confirm')` confirm control,
`otpForm()`), each a `NonNullableFormBuilder` group validated by `schemaValidator` over the generated
request schema (`zCredentials`, `pick(zOtpVerificationBody, ['code'])`), so no limit is copied. The
page calls the function in a field initializer, submits only a valid form, awaits a store method
that returns whether it worked, and on `validation_failed` calls `applyFieldErrors`.

<!-- @server-end -->
## Styling

Two homes. `src/styles/` is the global and app-wide CSS and nothing else, loaded by
`angular.json`: `styles.scss`, `setup/` (variables, breakpoints, functions, mixins, typography,
layers; emits no CSS but the typography and layer order), `themes/` (the generated brand tokens and
the product's additions) and `basics/` (`helpers`, `base`, `layout`). Every component and page
owns a sibling `<stem>.component.scss` named by its `styleUrl`. Breakpoints `sm` 576, `md` 768,
`lg` 1024, `xl` 1280, `xxl` 1536, mobile first (`@include up(md)`); spacing on a 4 px base. The
brand tokens come from `src/styles/themes/brand.css`, which the generator fills.

- **Order and layers.** `styles.scss` `@use`s `setup/layers` first (`@layer setup, themes,
basics;`), then setup, themes, basics; the rules of those six global partials sit inside their
  `@layer`. A component sheet is never layered, so its rules win over the global ones. A sheet
  `@use`s `setup/...` (the stylesheet include path is `src/styles`) for the functions (`space()`,
  `z()`) and mixins it needs, never themes or basics. Class names are BEM
  (`.page-header__actions`).
- **Encapsulation is emulated.** A sheet styles its own template; `:host` styles the component's
  host element (`<app-button>` is `:host { display: contents }`, a block control is
  `:host { display: block }`). `ViewEncapsulation.None` and `::ng-deep` are refused by the scan.
  A parent may style a child's host element when the child is in the parent's own template
  (a `.toolbar__save` class on an `<app-button>`), and it wins over the
  child's `:host` rule only because both sheets are encapsulated, so move every sheet, never a
  subset. A parent never restyles a child's interior (`.toolbar .button`): the child takes an
  input instead (`app-button` has `block`, which fills its container and aligns the label to the
  start). Projected content is styled by the component that authors it. A rule that must depend on
  an ancestor outside the template uses `:host-context(.ancestor)`. The CDK builds overlay panes
  and backdrops outside every view, so they have no owning sheet: their structural CSS comes from
  the CDK, and the modal's pane and backdrop rules (`.modal__panel*`, `.modal__backdrop`, applied
  by `ModalService` as `panelClass` and `backdropClass`) are in `styles/basics/_layout.scss`. The
  modal's own sheet styles what is inside its template.
- **One shared sheet.** `shared/components/form/controls.scss` is the `.control` block that `input`,
  `select` and `textarea` render; each lists it in `styleUrls: ['../controls.scss']`. The scan
  accepts a sheet two or more sibling folders reference and nothing else.
- **Tokens.** Colour, radius and font come from the custom properties (`var(--primary)`,
  `var(--surface-2)`, `var(--focus-ring)`); never a literal colour. `themes/_light.scss` and
  `_dark.scss` hold the same keys. `<html data-theme>` selects the dark values;
  `public/theme-init.js` sets it before first paint, `ThemeService` keeps it in step.
- **Logical properties only** (`margin-inline`, `padding-block`, `inset-inline-start`,
  `text-align: start`): the layout mirrors under `dir="rtl"`, so no `left`, `right`,
  `margin-left` and the like. Check a new component with `<html dir="rtl">` (the language toggle
  sets it).
- **44 px.** Every control spans at least 44 px under `(pointer: coarse)`, whatever
  `data-density` says: use `@include touch-target` on any new control.
- **Icons.** One set: `shared/components/icon` (inline SVG paths, no package). One concept, one
  icon; a new concept adds an entry there, never a second set.
- **Toasts.** One implementation: `NotificationService` renders `shared/components/toast` on the
  CDK overlay. A toast may carry one action (`{ labelKey, run }`, a copy key and a callback; only
  `showInfo` and `showWarning` take it): it never times out and is dismissed when the action runs.
- **Theme toggle.** One toggle for everyone, `app-theme-toggle`: a ghost icon button that cycles
<!-- @server-start -->
  light, dark and system. The product places it once, in its header (The shell). An account menu
  holds avatar, email, profile and sign out, and no theme control.
<!-- @server-end -->
<!-- @noserver-start -->
  light, dark and system. The product places it once, in its header (The shell).
<!-- @noserver-end -->
- **External libraries.** An external library is imported only by its facade: zod by `shared/utils/validation.ts` (`text`, `number`, `object`, `field`, `pick`, `either`, `check`, `validate` and the `Schema` types); call no method on a schema anywhere else, the generated `zod.gen` schemas and specs included. Lint refuses the import elsewhere. The framework, rxjs, Transloco (`core/i18n/`) and NgRx Signals (`store/`) are the architecture and need no facade.
- **Copy.** Every user-visible string in a template goes through the `t` pipe
  (`{{ 'notFound.title' | t }}`) with its key in `core/i18n/translations/en.json`, nested by area,
  `{{param}}` for values, and the same key in `he.json` when the `i18n` flag is on. Code asks
  `inject(Translator)`; nothing outside `core/i18n/` imports a translation library, and nothing
  branches on the flag (`core/i18n/translator.provider.ts` binds the translator for either mode).
- **Flag off (`i18n`).** The language toggle, `he.json` and the Transloco dependency are gone; the
  English table is bundled into the build (`translator.provider.ts`, the `// @noi18n` lines) and every
  `t` and `Translator` call site is unchanged.
- **Width.** A form lives in a card or a page no wider than `26rem` (`auth-card`) or `40rem`
  (`home.component.scss`, `not-found.component.scss`); do not stretch a form field across the
  container. The container itself is `app-page` (`shared/components/page/`): the width limit, the
  centring, the gutters and the compact-density padding. `main` has none of them, so a page wraps
  its template in `<app-page>`, the route-level screens (not-found, forbidden) too, and a
  full-bleed page (a board, an editor) leaves it out.
- **Text inputs and labels.** A component input that carries text takes an already translated string,
  and the heading input of `app-page-header`, `app-empty-state` and `app-error-state` is `heading`,
  never `title` (a static `title="..."` would also set the native tooltip). An `app-button` with
  `size="icon"` needs `ariaLabel`; dev mode logs a console error when it is missing.
- **Raw controls** (`<button>`, `<input>`, `<select>`, `<textarea>`) exist only under
  `shared/components/`; a page never writes one, it uses the components below. `app-button` also
  renders a link (`link="/"`) so navigation and actions look the same.
- **Key or text.** An input named `...Key` (`labelKey`, `titleKey`, `submitKey`, `emptyKey`) and the
  data-table `caption` take a key of the copy table and translate it themselves; every other text
  input (`label`, `hint`, `heading`, `placeholder`) takes an already translated string.

**The components** (`shared/components/<name>/`, the form controls in `shared/components/form/<name>/`; the rubric names of the `ui-design` skill):

| Component                                 | What it is                                                                                                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `button` (`app-button`)                   | The one `<button>` (or a link with `link`); `variant`, `size`, `loading`, `ariaLabel` for `size="icon"`.                                                                                                         |
| `icon`                                    | The one icon set, inline SVG; a new concept adds an entry.                                                                                                                                                       |
| `form-field` (`app-form-field`)           | Label, hint, the projected control and its first error (below).                                                                                                                                                  |
| `input`, `select`, `textarea`, `checkbox` | The controls; each is a `ControlValueAccessor` bound with `formControlName`. `input` has `type`, `autocomplete`, `inputmode`, a password toggle.                                                                 |
| `form-actions` (`app-form-actions`)       | Submit (`pending` shows the spinner and disables) and optional cancel (`cancellable`, `(cancelled)`); stacked on phones.                                                                                         |
| `page` (`app-page`)                       | The page container: width limit, centring, gutters and compact padding; `main` has none.                                                                                                                         |
| `page-header`                             | Page heading, description and an `actions` slot.                                                                                                                                                                 |
| `data-table` (`app-data-table`)           | `columns`, `rows`, an optional `#cell` template, caption, empty state; scrolls inside its container.                                                                                                             |
| `modal` (`app-modal`, `ModalService`)     | `ModalService.open(component or template, { titleKey, size, data })` is the dialog; `ModalService.confirm({ titleKey, messageKey, danger })` is the confirm pattern (`app-confirm-dialog`), over the CDK dialog. |
| `toast`                                   | The list `NotificationService` renders.                                                                                                                                                                          |
| `empty-state`, `error-state`              | What a list shows with nothing to show, and what a failed load shows (`heading`, `description`, `actions` slot).                                                                                                 |
| `skeleton`, `spinner`                     | Loading placeholders; the spinner is a status region unless `decorative`.                                                                                                                                        |

<!-- @server:auth-start -->

With the server's `auth` flag, `shared/components/auth-card` (`app-auth-card`) is the sign-in and
sign-up card, 26rem wide: inputs `heading` (required) and `description`, the default slot for the
form and a `[footer]` slot for the alternate link. The files exist only with `auth`.

<!-- @server:auth-end -->

Beside them: `shared/directives/autofocus.directive.ts` (`appAutofocus`: focuses the element, or the
first control inside it, once after render), `shared/pipes` (`t`; `relativeTime`: ISO or Date to
"3 minutes ago" in the translator's language, the clock is the `NOW` token; `phone`: E.164 to a
grouped display, anything else unchanged) and `shared/utils/time.ts` (pure: `parseTime`,
`differenceIn`, `isSameDay`).

<!-- @server-start -->
**The form recipe.** A page module's `<module>.form.ts` builds the typed `FormGroup` with
`{ validators: schemaValidator(zCredentials) }` over the generated zod request schema
(`services/generated/zod.gen`), so a rule is written once, in the server's contract: a limit is
never copied into the template (there is no `password.ts`; the generated schema validates a
password). `schemaValidator` (`shared/validators/schema.validator.ts`) writes each issue onto the control its path names
(`errors.schema = { messageKey, params }`, copy `errors.required|minlength|maxlength|min|max|email|
pattern|invalid`), clears it when the value is fixed, and returns an issue that matches no control
as a group error on the form (`form.errors.schema`; no template page toasts it). A server validation failure reaches the same fields through
`applyFieldErrors` (see Errors). `shared/validators/match.ts` (a confirm field) is the one other
validator; a field the contract names is never re-validated by hand, even when the control needs
a looser shape (`user.form.ts` widens the generated phone rule with `either(field(...), literal(''))` to accept `''`, meaning "remove the
number", and keeps the rule itself). The page composes
<!-- @server-end -->
<!-- @noserver-start -->
**The form recipe.** A page module's `<module>.form.ts` builds the typed `FormGroup`; `schemaValidator`
writes each issue of a schema onto the control its path names
(`errors.schema = { messageKey, params }`, copy `errors.required|minlength|maxlength|min|max|email|
pattern|invalid`), clears it when the value is fixed, and returns an issue that matches no control
as a group error on the form (`form.errors.schema`; no template page toasts it).
`shared/validators/match.ts` (a confirm field) is the one other validator. The page composes
<!-- @noserver-end -->
`<form [formGroup]="form" (ngSubmit)="submit()">`, one `<app-form-field [label]="'auth.email' | t">`
around each control (`<app-input formControlName="email" type="email" autocomplete="email" />`), and
`<app-form-actions [pending]="store.loading()" />`. The field finds its control through
`NgControl`, takes the control's id for the label's `for`, shows the first error once the control is
touched or the `[formGroup]` was submitted, and sets `aria-invalid` and `aria-describedby` on the
control through the `FORM_FIELD` token. Error text is `errors.<validator key>` in `en.json`
(`required`, `email`, `minlength`, `maxlength`, `min`, `max`, `pattern`; lengths fill `{{min}}` and
`{{max}}`); a validator can name its own copy with `{ messageKey, params }` as the error value. A
checkbox carries its own label: give its field no `label`.

## Errors

<!-- @server-start -->
The error interceptor maps an `HttpErrorResponse` to an `ApiError` and nothing else; the page or
store method that awaited the call shows the outcome.

- **`ApiError`** (`services/api-error.ts`): `status`, `code`, `requestId` (the envelope's, else the
  `x-request-id` header, else `null`) and `fieldErrors?` (path -> codes, from a validation envelope's
  `details`). `isApiError()` is the guard. The server's `message` is never kept or shown.
- **Codes.** The envelope's: `validation_failed`, `unauthenticated`, `forbidden`, `not_found`,
  `conflict`, `payload_too_large`, `unsupported_media_type`, `rate_limited`, `internal`,
  `upstream_unavailable`. Ours: `network` (no response), `unknown` (not the envelope, or a code the
  table lacks), `validation` (a client check that failed before any request, e.g. a file upload).
- **Copy table.** Each code has `errors.<code>` in `en.json`, plus `errors.offline` and
  `errors.unexpected`. `errorMessageKey(code)` returns the key, `errors.unknown` for anything else;
  a spec compares the code list with `en.json`, and a code added to the contract fails the build in
  `models/api/constant.ts` until it is listed.
- **Failure rejects.** The client is configured with `throwOnError: true` and each facade call repeats
  it, so a facade returns the call's `data` and a failure rejects with the `ApiError`. The awaiting
  store method (or page) catches it and toasts through the copy table.
- **Interceptors.** `provideHttp()` in `core/interceptors/http.provider.ts` is the one place the
  order is set: loading (outermost, so one exchange counts once even if the auth interceptor replays
  it), then the error mapper, then the auth interceptor appended last. A request marked
  `BACKGROUND` (`core/config/http-context.ts`) skips the loading count; the generated SDK takes no
  `HttpContext`, so only a request made with `HttpClient` directly can set it.
- **401 and the session (with auth).** The auth interceptor, innermost, sends the cookies and turns a
  401 into one refresh and one replay, only when the session hint is set and the request is not one
  of the exempt calls (`/api/auth/login`, `signup`, `refresh`, `otp`, `otp/verification`: they answer
  401 for reasons a refresh cannot fix, and the generated client takes no `HttpContext`, so the
  exemption is by URL). Concurrent 401s share the one in-flight `AuthStore.refresh()`; a replay that
  fails again reaches the caller, and so does the original 401 when the refresh fails (a 400, 401 or
  403 also clears the hint and the account). Sign-out is not exempt: with only the refresh cookie
  left it needs a refresh to revoke the session. `unauthenticated` reads "Your session has expired.
  Sign in again." everywhere except sign-in, where the store shows `auth.login.invalid` (the
  credentials are wrong, nothing expired); `forbidden` reads "You do not have access to this." and a
  role the account lacks goes to `/forbidden` instead.
- **A refused refresh ends the session on screen.** When the refresh answers 400, 401 or 403 (the hint
  is gone), the interceptor navigates to `/auth/login?next=<current url>` through `toLogin` (the
  helper `authGuard` uses), so a user on `/profile` whose session died lands on sign-in, not on an
  error state. It does not navigate while `AuthStore.restoring()` is true (the start-up probe of
  `/api/user/me` on a public page must not bounce a visitor; the guards protect guarded routes), nor
  when already on a login URL, nor after a network error or 5xx (the session may be fine; the cause is
  logged and the hint kept).
- **Scope and start-up.** The interceptor acts only on the app's own `/api/` (same origin): a
  third-party URL gets no cookies and no refresh. `restoreSession` never clears the hint itself;
  only a refused refresh does. The session initializer waits at most 5 s for `/api/user/me` and
  then starts as a visitor (logged once, hint kept), so a hung API cannot block the first render. A
  start that fails closed sends a guarded deep link to `/auth/login?next=...`; the visitor signs in
  again, or reloads if the API was only slow.
- **Field errors.** On an `ApiError` with `code === 'validation_failed'` the page calls
  `applyFieldErrors(form, error)` (`shared/validators/server-errors.ts`): each path in `fieldErrors`
  (dotted, like `items.1.label`) that names a control gets a `server` error with `errors.invalid`
  and shows in its field; the unmapped paths come back and the page toasts `errors.validation_failed` once
  for them (none: nothing). Any other code toasts its own copy. A store method behind a form does not
  toast `validation_failed` itself; it leaves the error in the store for the page. A field error is
  never also a toast.
<!-- @server-end -->
<!-- @noserver-start -->
Without a server there is no request to fail: the `ApiError` envelope, its copy table, the error
interceptor and `applyFieldErrors` arrive with one (see Adding a feature).

<!-- @noserver-end -->
- **Toasts.** A toast (`NotificationService.showError('errors.unexpected')`, a key of the copy
  table) fires from the handler that awaited the work, never from an interceptor or an `effect`.
- **Failure state.** A page whose load failed shows `app-error-state` with the mapped description and
  a retry that calls the store method again; the data it already had stays out of the way.
- **Last resort.** `GlobalErrorHandler` logs through `LoggerService` and shows one
  `errors.unexpected` toast for anything nothing caught. An error a handler can name is shown
  there, not here.

## Tests

- Unit tests run with `bun run test` (`ng test --no-watch`: Vitest on jsdom). Specs are co-located
  with the code, `src/**/*.spec.ts`. Checks on files outside `src/` (the ESLint config, the
  component-styles, folders and restricted-element scans) live in `tests/unit/*.spec.ts`, each starting with
  `// @vitest-environment node`; the builder runs both homes together.
- **The boundaries test** (`tests/unit/eslint-boundaries.spec.ts`) also asserts that a file outside
  every layer (`src/app/components/`, `src/app/features/`, `src/app/widgets/`) is refused.
- **The folders scan** (`tests/unit/folders.spec.ts`): every file under `models/` is
  `<noun>/(interface|type|enum|constant).ts`; two files of one stem in `layout/`, `shared/components/`,
  `pages/` or `app/` sit in a folder of that name; no `components/` folder exists outside `shared/`.
- **The styles scan** (`tests/unit/component-styles.spec.ts`) is Styling as a test: `src/styles/`
  holds exactly `basics`, `setup`, `styles.scss` and `themes`; every other `.scss` is referenced by
  its sibling `<stem>.component.ts` (or by two or more components when shared); a reference is
  `./x.scss` or `../x.scss`; no inline `styles:`, no `ViewEncapsulation.None`, no `::ng-deep`; every
  folder in `layout/` starts with `app-` and its class with `App`; the global partials sit in
  their layer and no component sheet does. The control sizing contract (36, 32, 44 px) is asserted by
  the e2e (`shell.spec`) on the rendered page, not by a compile test.
<!-- @server-start -->
- **A facade or an interceptor** is tested with `provideHttpClient(withInterceptors([...]))`,
  `provideHttpClientTesting()` and, for the SDK, `provideApiClient()` (from
  `core/config/api-client.provider`). The generated client issues its request after one internal
  `await`, so a spec yields a microtask before `expectOne`:
  `const result = service.get(); await Promise.resolve(); http.expectOne(...).flush(...); await result`.
  Call `http.verify()` in `afterEach`.
<!-- @server-end -->
- **A store** is tested with its service replaced by `{ provide: Service, useValue: { ... } }`; a
  page with the store replaced by plain signals and a `vi.fn()` for each method.
- **A spec that renders text** provides `provideTestTranslator()` (`core/i18n/translator.testing`),
  never `provideTranslator()`: it loads `en.json` (and `he.json`) from memory, so English assertions
  read the same with the `i18n` flag on or off. The language toggle's spec is gated with its
  component, by the `i18n` flag's `onlyPaths` in `template.yaml`.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`) and run with
  `bun run test:e2e`. Install the browser once with `bunx playwright install chromium` (add
  `--with-deps` on Linux).
<!-- @server-start -->
- **Two modes.** By default `playwright.config.ts` starts the API fresh (`reuseExistingServer:
false`, `RATE_LIMIT_SCALE=100`) and then `bun run build && node scripts/e2e-static.mjs`: a
  dependency-free static server for `dist/` on the template's port that forwards `/api` to the
  API, so the page and the API share one origin as in the image. With `E2E_BASE_URL` set (a blank
  value counts as unset) it tests that URL and starts nothing; the catalog's case runner does this
  against the Compose stack. The API there runs at rate-limit scale 1 with one per-address bucket,
  so the suite can run about once per 15 minutes per stack, and it leaves its accounts in that
  stack's database.
<!-- @server-end -->
<!-- @noserver-start -->
- **Two modes.** By default `playwright.config.ts` starts `bun run build && node scripts/e2e-static.mjs`:
  a dependency-free static server for `dist/` on the template's port. With `E2E_BASE_URL` set (a blank
  value counts as unset) it tests that URL and starts nothing.
<!-- @noserver-end -->
- **Service workers are blocked** (`serviceWorkers: 'block'`), so a registered worker never serves
<!-- @server-start -->
  a stale shell or API answer to a test. `retries: 0`, `forbidOnly`, and a trace is kept on
<!-- @server-end -->
<!-- @noserver-start -->
  a stale shell to a test. `retries: 0`, `forbidOnly`, and a trace is kept on
<!-- @noserver-end -->
  failure: a test that passes only on a retry is a failure.
  The trace stores request bodies (the synthetic test password and e-mails) under `test-results/`
  (git-ignored), so never point the suite at real accounts.

<!-- @server:database-start -->

- **E2E database.** The server's `e2eDb` command is chained before its start command, on
  `app_e2e`, because Playwright starts web servers before `globalSetup`; the development database
  is never touched. `E2E_DATABASE_URL` overrides the URL, a blank value takes the default, and a
  name that does not end in `_e2e` (or a URL with a `dbname` query) is refused when the config
  loads (`scripts/e2e-database-url.ts`, unit tested). Container mode starts no API and skips the
  check.

<!-- @server:database-end -->

- **Projects.** `phone` (`devices['Pixel 7']`, touch) runs every spec; `desktop`
  (`devices['Desktop Chrome']`) runs `shell.spec.ts` and `screens.spec.ts`. A check that belongs to
  one of them carries `@phone` or `@desktop` in its title (`{ tag: '@phone' }`) and the other
  project's `grepInvert` leaves it out, so nothing skips at run time; never a `test.skip`.
- **Specs.** `shell.spec.ts` asserts the skip link (first in the tab order, focuses `main`), one
  `main` with id `main`, no horizontal overflow, the 404 inside `main`, its control at 44 px (phone,
  also with `data-density="compact"`) and the desktop densities and compact spacing; a product's
  header and navigation add their own assertions there. `smoke.spec.ts` asserts that the index
<!-- @server-start -->
  route is one `h1` inside `main` and that `/api/health` answers through the page's origin. `screens.spec.ts` captures every screen
<!-- @server-end -->
<!-- @noserver-start -->
  route is one `h1` inside `main`. `screens.spec.ts` captures every screen
<!-- @noserver-end -->
  in phone and desktop, light and dark, to `test-results/screens/<route>-<viewport>-<theme>.png`
  (QA reads them) and checks each: no axe violation of the WCAG A and AA tags (in dark this is the
  contrast measurement), no horizontal scroll, exactly one `h1`. A failure names the route, theme
  and project with the rule ids and targets (`screenProblems` in `support.ts`).
- **Screen routes.** `tests/e2e/screen-routes.ts` builds the list from `src/app/nav.ts`, so a nav
  entry is covered with no edit. A route that is not in the nav (an auth screen) is added to
  `AUTH_ROUTES`; a route that needs an account is added to `SIGNED_IN_ROUTES` instead, because
  signed out it is the sign-in redirect and would write the same screenshot name. A nav entry with
  `roles` must be listed in `SIGNED_IN_ROUTES`; one that needs a role the test account lacks needs
  a setup the project writes in `tests/e2e/auth-support.ts`.

<!-- @server:auth-start -->

- **Signed in.** `SIGNED_IN_ROUTES` (`/profile`, `/auth/verify-otp`) are captured after
  `signupThroughApi`, which signs up through the API (the cookies land in the browser context)
  and plants the session hint (`localStorage` key `session`, the JSON string `"1"`). Entries share
  one account per project because the signup route is rate limited. `auth.spec.ts` covers
  sign-up, sign-in, the profile (`expectSignedIn` reads the account there), sign-out from the
  profile page, a wrong password and the guarded redirect with `next`. Two calls that expire
  together sharing one `/api/auth/refresh` is the interceptor's unit test.


<!-- @server:auth-end -->
<!-- @server-start -->
- The data rule: a journey creates its data through the API or the UI with a name unique per run
  (`uniqueEmail`), and never takes the database's contents as a precondition.
<!-- @server-end -->
<!-- @noserver-start -->
- The data rule: a journey creates its data through the UI with a name unique per run, and never
  takes stored contents as a precondition.
<!-- @noserver-end -->
- Every new behaviour gets a test for the happy path and at least one for a failure or empty
  path. No `.skip`, `.only`, `test.fixme` or `describe.skip`; a removed test is named in the
  report.
- `bun run check` runs the typecheck (`ngc`, which covers templates under `strictTemplates`), lint,
  the format check and the unit tests.

## Deployment

<!-- @server-start -->
- `bun run dev` serves the app (`ng serve`) and proxies `/api` to the server's port through
  `proxy.conf.mjs`.
- `bun run build` writes `dist/` with `index.html` and the hashed files at its root. The app calls
  the API at relative `/api`, so whatever serves `dist/` also routes `/api` to the server.
<!-- @server-end -->
<!-- @noserver-start -->
- `bun run dev` serves the app (`ng serve`).
- `bun run build` writes `dist/` with `index.html` and the hashed files at its root.
<!-- @noserver-end -->
- **Service worker (the `pwa` flag).** `ngsw-config.json` is read by the production build, which
  emits `ngsw-worker.js` and `ngsw.json` into `dist/`; the worker registers once the app is
  stable or after 30 s (`registerWhenStable:30000`) and never in development. It prefetches the
  shell (`index.html`, the manifest, the hashed JS and CSS), caches icons and media lazily, and
  serves `/i18n/**` as an asset group (lazy install, prefetched on update), so the copy tables
<!-- @server-start -->
  change with the app and a new key never renders raw after a deploy. There is no data group: no API
  answer is cached. Angular's worker has no `!` negation in `dataGroups[].urls` (it reads one as a
  literal path), so nothing is excluded by pattern: anything not listed is never cached. A product
  that caches a public read adds a group of explicit URLs that carry no session or personal data,
  never `/api/**`; `tests/unit/ngsw-config.spec.ts` rejects a `!` entry and any group that matches
  `/api/user/**` or `/api/auth/**`. The iOS install hint can be dismissed and stays dismissed.
<!-- @server-end -->
<!-- @noserver-start -->
  change with the app and a new key never renders raw after a deploy. There is no data group: only the
  app itself is cached. Angular's worker has no `!` negation in `dataGroups[].urls` (it reads one as a
  literal path), so nothing is excluded by pattern: anything not listed is never cached. A product
  that caches a public read adds a group of explicit URLs that carry no session or personal data;
  `tests/unit/ngsw-config.spec.ts` guards these rules. The iOS install hint can be dismissed and stays dismissed.
<!-- @noserver-end -->
- **How an update reaches the user.** The worker downloads a new version in the background
  (`AppUpdateService` checks at start, hourly once stable and on window focus). When it is
  ready, an info toast offers `pwa.reload`; the action activates the version and reloads the
  page. An unrecoverable worker state shows a warning toast with the same action. Serve
  `ngsw-worker.js`, `ngsw.json` and `index.html` with `Cache-Control: no-cache`.
- **Install.** `public/manifest.webmanifest` (the theme and background colours are `#ffffff`;
  change them to the brand) and the placeholder icons in `public/icons/` (`icon.svg`,
  `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`) ship with the
  template. **Replace the icons** with the product's own. `app-install-button` shows when the
  browser offers an install, and `app-install-hint` on iOS Safari (no install event there).
- **Flag off.** Without `pwa` the manifest, icons, services, initializer and the two install components are
  gone, `@angular/service-worker` stays installed, and the build still emits an unregistered
  `ngsw-worker.js` and `ngsw.json` in `dist/` (the `serviceWorker` build option stays).
<!-- @server-start -->
- The app calls the API at relative `/api` on its own origin in every environment: no API URL is
  compiled into the bundle and there is no CORS. Whatever serves `dist/` must also route `/api` to
  the server (a reverse proxy, or the server serving the files itself).
<!-- @server-end -->
<!-- @noserver-start -->
- Whatever serves `dist/` needs only the static files and a fallback to `index.html`.
<!-- @noserver-end -->
<!-- @server-start -->
- **Two modes**, chosen at generation (`--deploy`).
  - `single` (default): one container. The server serves `dist/` and `/api` on its own port
    (published on every interface), so the page is on the server's port and the template's port is
    dev-only.
  - `split`: two containers. This package's nginx serves the files on the template's port
    (published on every interface, the public edge) and proxies `/api/` to the server, which is
    published on loopback only.
<!-- @server-end -->
<!-- @noserver-start -->
- **No deploy mode.** A lone frontend writes no `docker-compose.yml`; it ships as its own image (the
  `serve` target below) or as `dist/` on a static host.
<!-- @noserver-end -->
- **`Dockerfile` targets.** `build` is `node:24-alpine` with the Bun binary copied in (the Angular
  CLI runs on Node; Bun installs and drives it): a frozen install and `bun run build`. `dist` is
<!-- @server-start -->
  `FROM scratch` and holds only the built files at `/dist`: the server's image copies it
  (`COPY --from=spa /dist ./public`). `serve`, the last and so the default target, is
<!-- @server-end -->
<!-- @noserver-start -->
  `FROM scratch` and holds only the built files at `/dist`. `serve`, the last and so the default target, is
<!-- @noserver-end -->
  `nginxinc/nginx-unprivileged:1.31.7-alpine` with the files at `/usr/share/nginx/html`; it runs as
  uid 101, listens on `PORT` and has a `wget` healthcheck. `.dockerignore` keeps environment files,
  tests, `.angular` and source maps out of every image.
- **nginx files**, in `nginx/`. `default.conf` is the config template (copied to
  `/etc/nginx/templates/default.conf.template`; the entrypoint renders it with `envsubst` over
<!-- @server-start -->
  `PORT` and `API_URL`). Cache policy per file class: the hashed root files (`main-`, `polyfills-`,
<!-- @server-end -->
<!-- @noserver-start -->
  `PORT`). Cache policy per file class: the hashed root files (`main-`, `polyfills-`,
<!-- @noserver-end -->
  `chunk-`, `styles-` and an eight-character hash) and `/media/*` are `immutable` for a year;
  `/icons/*` one day; `index.html`, `ngsw.json`, `ngsw-worker.js`, `safety-worker.js`,
  `worker-basic.min.js`, `manifest.webmanifest`, `/i18n/*` and any other file are `no-cache`; an
  extension-less path is `index.html`; a missing file with an extension, a dotfile and a bare
  `/icons/`, `/media/` or `/i18n/` are 404 (never a listing); a path above the root is nginx's own
<!-- @server-start -->
  400; `/api/` is proxied with `X-Forwarded-For` and the server's own headers pass through.
<!-- @server-end -->
<!-- @noserver-start -->
  400.
<!-- @noserver-end -->
  Keep three rules when editing: no `add_header` at server level (a location with its own drops
  the inherited ones), no dollar sign in a comment (`envsubst` rewrites it), and no environment
  variable named like an nginx variable (`host`, `uri`).
- **Content Security Policy.** `security-headers.conf` holds the headers of helmet 8.3.0 and is
  included by each static location. `script-src 'self'` (no inline script: `theme-init.js` is a
  file, and the build keeps `optimization.styles.inlineCritical` off because it would add an inline
  script that the policy blocks), `worker-src 'self'` for the service worker and `manifest-src
'self'`. A project that loads a font, an image or an API from another origin widens the matching
  directive there, and nowhere else.
<!-- @server-start -->
- **Compose fragment** (`compose.yaml`), per mode. `single`: `build: { context, target: dist }`
  with `scale: 0`, so the image is built and no container runs; the server's build reads it as
  `additional_contexts: spa: service:<dir>`. This needs **Docker Compose 2.35.0 or newer**.
  `split`: `target: serve`, `ports`, `API_URL` (the server's name and port on the Compose
  network), `depends_on` the server, and the `app` profile. Run with
  `docker compose --profile app up --build --wait`; stop with
  `docker compose --profile app down`, because a plain `down` does not see profile services.
- **`TRUST_PROXY`** is the server's. `single`: `false`, because nothing sits in front of it.
  `split`: `1`, because nginx is the one hop and sets `X-Forwarded-For`. Raise it by one for every
  proxy placed in front of the edge. The `ng serve` dev server and the e2e static server forward
  the client address as 127.0.0.1 only, so a rate-limit test there shares one bucket.
- **Cookies and TLS.** The API sets the session cookies `Secure` outside development, so a
  non-loopback host needs TLS at an edge, while the CSP carries `upgrade-insecure-requests` and
  `Strict-Transport-Security`. In `split` nginx sends `X-Forwarded-Proto: $scheme` (always `http`
  at this hop): behind a TLS edge, forward the edge's value (`$http_x_forwarded_proto`) in the
  `/api/` location and make the server's `TRUST_PROXY` count the edge too.
- **Body size.** nginx's `client_max_body_size` is its 1 MB default, as is the servers' cap, so an
  oversize body gets nginx's own 413 page. To accept more, raise the server's limit and set
  `client_max_body_size` in the `/api/` location to match.
<!-- @server-end -->
<!-- @noserver-start -->
- **Image.** `docker build --target serve` builds the nginx image; `PORT` sets its listening port.
<!-- @noserver-end -->
<!-- @server-start -->
- **What a project changes.** The brand colours in `public/manifest.webmanifest`, the icons in
  `public/icons/`, the CSP directives for any origin it adds, `client_max_body_size`, and the
  Compose lines when it switches mode (copy the other mode's lines from `compose.yaml` of the
  catalog's template).
<!-- @server-end -->
<!-- @noserver-start -->
- **What a project changes.** The brand colours in `public/manifest.webmanifest`, the icons in
  `public/icons/` and the CSP directives for any origin it adds.
<!-- @noserver-end -->
