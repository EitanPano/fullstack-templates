The layer map of this package. Commands are in `package.json`; the contract code in `src/services/generated/` is generated, never edited.

**`src/`**

- `main.ts`: imports the font, `styles/themes/brand.css`, `styles/styles.scss` and
  `shared/validators/zod-config`, creates the app, calls `installPlugins(app)` and mounts in its
  `.then` (the saved language loads before the first render). It installs
  `core/initializers/preload-error`: one reload per 30 s on `vite:preloadError` (a chunk the new
  build no longer has), then the error surfaces.
- `app/`: the wiring; no product logic, no fetch. `App.vue` (a `<RouterView />`), `plugins.ts`
  (`installPlugins`: Pinia, router, i18n, the error interceptor, the global error handler, the
  `has-role` directive and `ROLES_KEY`, the session and PWA initializers), `routes.ts` (the main
  layout with `props: { nav: NAV }`, one lazy `*.routes.ts` per feature, the catch-all last; the
  auth layout and its routes with auth), `router.ts` (sets `document.title` from
  `meta.titleKey`) and `nav.ts` (the one navigation table; `NavEntry` lives in `models/nav/`, and
  `layout/` receives the table as a route prop because it may not import `app/`).
- `core/`: singletons wired once in `app/plugins.ts`, never imported by `shared/`.
  `config/` (`env.ts` the only reader of `import.meta`, `constants.ts` with the `STORAGE_KEYS`,
  `api-client.ts` the generator's `runtimeConfigPath`), `interceptors/`, `guards/`,
  `initializers/`, `providers/` (storage, logger, theme DOM helpers and, with auth, the session
  hint: platform wrappers with no reactive state), `i18n/` (vue-i18n with English bundled; with
  the `i18n` flag also `languages.ts` and `translations/he.json`), `errors/`.
- `layout/`: `main-layout` (skip link, header, side nav, `<main id="main">`, footer, toast
  host), `auth-layout` (centred card, no shell; auth only) and `components/` (header, side nav,
  footer, toast host and `slots.ts`).
- `features/<feature>/`: one glossary noun or screen group. `<feature>.routes.ts` (a default
  export of `RouteRecordRaw[]`), `<feature>.form.ts` (a form over the generated zod schemas),
  `pages/<page>-page.vue` (routed; read a store) and `components/` (presentational).
- `store/`: every Pinia store, all setup stores. The domain stores (`health`, and with auth
  `auth` and `user`: one per server module) and the app-state stores (`theme`, `notification`,
  `network`, `loading`; `language` with `i18n`; `app-update` and `install-prompt` with `pwa`),
  plus `request-status.ts`. The import rule is the same for both kinds.
- `services/`: one facade per server module over the generated SDK; `generated/` is the Hey API
  output (types, the fetch client, the flat SDK, zod; committed, lint-ignored).
- `shared/`: product-agnostic. `components/` (the browser controls wrapped once), `directives/`,
  `composables/`, `validators/`, `utils/`.
- `models/`: a noun's types (re-exports of the generated types plus UI-only shapes), enums,
  constants.
- `testing/`: helpers imported only by `*.spec.ts`.
- `styles/`: the only home of CSS (see Styling).

**No scaffolder.** Never run `create-vue`, `npm create vue` or any generator inside this package:
they scatter files against the layer map and default to `<style scoped>` and Options API files.
Write the files by hand, copying the nearest sibling.

**Where does X go**

| Addition                                    | Home                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| A noun's types, enums, labels               | `models/<noun>/`                                         |
| A read or write on a server module          | `services/<module>.service.ts`                           |
| State a page reads, and the methods on it   | `store/<noun>.store.ts`                                  |
| A routed screen                             | `features/<feature>/pages/<page>-page.vue`               |
| A presentational piece of one feature       | `features/<feature>/components/`                         |
| A form                                      | `features/<feature>/<feature>.form.ts`                   |
| A reusable control, pattern or composable   | `shared/`                                                |
| A guard, interceptor, initializer, provider | `core/`                                                  |
| A navigation entry                          | `app/nav.ts`                                             |
| A style                                     | `styles/` (a component partial, or a view partial)       |
| A copy string                               | `core/i18n/translations/en.json` (and `he.json`, `i18n`) |

**Naming.** Files are kebab-case, and a component is PascalCase in a template:
`health-status-page.vue` renders as `<HealthStatusPage>`. `<script setup lang="ts">` and the
Composition API only. A one-word control carries the `App` prefix (`app-button.vue`,
`<AppButton>`; `vue/multi-word-component-names`). A file that is not a component takes a suffix:
`*.store.ts`, `*.service.ts`, `*.guard.ts`, `*.interceptor.ts`, `*.routes.ts`, `*.form.ts`,
`*.initializer.ts`; a composable is `use-kebab.ts` and exports `useKebab`. Cross-layer imports use
the alias `@/*` (`src/*`); imports inside one feature stay relative. Specs sit beside the file as
`*.spec.ts`.

**Import rules** (`eslint-plugin-boundaries`; each lint message names the layer to use instead):

| From                                                                                             | May import                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`                                                                                           | layout, features (`*.routes.ts` only), core, store, shared, models; never `services/`                                                                   |
| `main.ts` (the entry)                                                                            | app, core, shared, models                                                                                                                               |
| `layout/`                                                                                        | `core/config`, `core/providers`, store, shared, models                                                                                                  |
| `features/<f>/pages/`                                                                            | store, shared, models, `core/config`, `core/providers`, `core/guards` (the unsaved-changes composable), its own feature's `components/` and `*.form.ts` |
| `features/<f>/components/`                                                                       | shared, models                                                                                                                                          |
| `features/<f>/*.routes.ts`                                                                       | `core/guards`, its own pages                                                                                                                            |
| `features/<f>/*.form.ts`                                                                         | `shared/validators`, models, the generated zod schemas (`@/services/generated/zod.gen`)                                                                 |
| `store/`                                                                                         | store, services, models, `core/providers`, `core/config`, `core/i18n` (the language store applies the locale)                                           |
| `services/`                                                                                      | models, `core/config`, `services/generated`                                                                                                             |
| `core/guards`, `core/initializers`, `core/interceptors/error.interceptor.ts`, `http.provider.ts` | store, services, core, shared, models (they are the wiring); `http.provider.ts` alone imports the generated client                                      |
| `core/interceptors/loading.interceptor.ts`                                                       | `core/config`, `core/providers`, models and `store/loading.store.ts`                                                                                    |
| `core/interceptors/auth.interceptor.ts`                                                          | `core/config`, `core/providers`, models: a leaf, never `store/`, `services/` or another interceptor                                                     |
| `core/config`, `core/providers`, `core/i18n`, `core/errors`                                      | each other, shared, models; `core/config/api-client.ts` alone also the two fetch wrappers                                                               |
| `shared/`                                                                                        | shared, models                                                                                                                                          |
| `models/`                                                                                        | models; the generated types and zod schemas with `import type` only                                                                                     |
| `testing/`                                                                                       | anything; nothing outside a `*.spec.ts` imports it                                                                                                      |

- A feature never imports another feature. A page that needs a one-off request adds a facade
  method and a store method first.
- The generated runtime (`client.gen`, `sdk.gen`, the barrel) is imported only in `services/` and
  `core/interceptors/http.provider.ts`; `zod.gen` is the one generated file a `*.form.ts` may also
  import. `store/`, `core/` and `models/` take the generated types with `import type`; every other
  layer reads the contract's types through `models/<noun>/`.
- The two fetch wrappers (`loading.interceptor.ts`, `auth.interceptor.ts`) are leaves of the client
  config, which imports them: if one imported a store or a service the graph would be a cycle
  `client -> config -> wrapper -> store -> services -> client`.
- `fetch(` (the global) is called only in `core/interceptors/auth.interceptor.ts`; `import.meta`
  only in `core/config/env.ts` (`no-restricted-syntax`).
- `<button>`, `<input>`, `<select>` and `<textarea>` appear only inside `shared/components/`
  (`vue/no-restricted-html-elements`, off for that directory). No `<style>` block in any component
  (`vue/no-restricted-block`), no `style` attribute (`vue/no-static-inline-styles`, and
  `tests/unit/styles-tree.spec.ts` also reads bound ones), no `.css` or `.scss` import outside
  `main.ts`.
- A file in a directory no layer claims is an error (`boundaries/no-unknown-files`), and so is importing one (`boundaries/no-unknown-dependencies`). The boundary
  rule is silent on an import it cannot resolve, so `eslint-import-resolver-typescript` reads the
  `@/*` alias from `tsconfig.app.json` and resolves `.vue` imports; keep the setting when the
  config changes.

`tests/unit/eslint-boundaries.spec.ts` lints one violation and one allowed case per rule, through
the real `eslint.config.mjs`. A new rule gets a case there.

The API is always reached at relative `/api` on the page's own origin (see Deployment), so the
bundle carries no API URL.

## Adding a feature

The data flows one way: **page -> store -> facade -> generated SDK**. A page reads a store and never
a service; the generated runtime is imported only in `services/` and `http.provider.ts`. `health`
(the home screen) is the worked example, file by file:

1. **Glossary and contract.** Name the noun and the action in `.doc/glossary.md`. If the server's
   contract changed, run `bun run api:types` (the input is the server's `openapi.json`):
   `src/services/generated/` is regenerated and committed, never edited. The committed copy of
   the template comes from `server/python-fastapi`; a rule the contract states differs per
   server (the e-mail pattern exists in python-fastapi's, not in bun-express's), and a project
   regenerates the folder from its own server at bootstrap.
2. **Models** `models/health/`: `interface.ts` re-exports the generated types (`import type`; a
   hand-written API shape is a lint error) and `constants.ts` maps a status to its `labelKey` and
   tone. `models/api/` holds `ApiError`, `isApiError()`, `toApiError()`, `Paginated<T>` and
   `errorMessageKey()`.
3. **Service** `services/health.service.ts`: an object with one method per call, each
   `const { data } = await getApiHealth({ throwOnError: true })` and `return data`. A failure
   rejects with the `ApiError` the error interceptor built.
4. **Store** `store/health.store.ts`: `defineStore('health', () => { ... })`, a setup store.
   `const request = useRequestStatus()` (`status`, `error`, `loading`, `loaded`, `failed`,
   `setLoading`, `setLoaded`, `setError`, `fail`) and `return { ...request, health, load }`; a
   store with two independent requests calls it twice. A method is `request.setLoading()`,
   `await` the facade, patch the refs, `request.setLoaded()`; in the `catch` it toasts once:
   `notifications.showError(errorMessageKey(request.fail(cause, 'health.load').code))`. `fail`
   keeps the `ApiError` in state and logs a cause that is not an `ApiError`, so a bug is never
   silent. **Account data (with auth).** A store that holds an account's data (`user.store.ts` is
   the example) exposes `reset()` and clears itself when `auth.isLoggedIn` turns false, so
   sign-out and a refused refresh leave nothing for the next account; its `load()` drops the old
   value before it calls, and ignores an answer that arrives after sign-out. **Offline rule:** a
   store method that mutates checks `network.online` first and toasts `errors.offline` instead of
   sending (health only reads, so it does not).
5. **Feature folder** `features/health/`: `health.routes.ts` (the default export; a lazy
   `component: () => import('./pages/health-status-page.vue')` and `meta: { titleKey }`),
   `pages/health-status-page.vue` (routed; `storeToRefs` on the store; skeleton while loading,
   `<ErrorState>` with retry on failure, the loaded view) and `components/health-badge.vue`
   (presentational: props and a model table, no store).
6. **Route and nav.** The routes file is spread into the main layout's `children` in
   `app/routes.ts`, and for a top-level screen an entry goes in `app/nav.ts`
   (`{ path: '/', labelKey: 'nav.home' }`).
7. **View style** `styles/views/_health-status.scss`, forwarded from `views/_index.scss`.
8. **Copy** in `core/i18n/translations/en.json` **and `he.json`** (the `i18n` flag;
   `tests/unit/translation-parity.spec.ts` fails when a key or a `{param}` is missing from one):
   `nav.home`, `health.*`, and the `errors.<code>` text for any new envelope code. Use every key
   through `$t` or `t` and never branch on the flag.
9. **Specs** beside each file (see Tests): service, store, page, component.

**Guarding a route (the server's `auth` flag; the files exist only then).** `core/guards/` holds
`authGuard` (a visitor is redirected to `/auth/login?next=<attempted path and query>`),
`guestGuard` (login and register: an account goes home) and `roleGuard`. They are
`beforeEnter` guards on the route in the feature's `*.routes.ts`: `{ path: '', beforeEnter:
authGuard, component: ... }`, and for a role `{ beforeEnter: roleGuard, meta: { roles: ['admin']
}, ... }` (a visitor goes to login, another role to `/forbidden`). Each awaits `authStore.ready`
before it decides. A guard only keeps a visitor off a screen; the API decides on every call. In a
template, `v-has-role="'admin'"` (or an array) hides a control from an account without the role:
`shared/directives/has-role.ts` is built per app by `createHasRoleDirective(roles)` and registered
in `app/plugins.ts`, which also provides `ROLES_KEY` (`shared/directives/roles.ts`) from the same
ref, so the side nav's filter by `NavEntry.roles` injects it. A page with edits to lose calls
`useUnsavedChangesGuard(hasChanges)` (`core/guards/unsaved-changes.guard.ts`; `hasChanges` is a
function answering whether there are edits) and binds the returned state to a `<ConfirmDialog>`
(`profile-page.vue` is the example). The login page reads `next` through `safeNextPath`
(`shared/utils/next-path.ts`): only a path on this site is followed, anything else is `/`.

**The session hint.** The session is two HttpOnly cookies; JavaScript never holds a token. The
hint (`STORAGE_KEYS.sessionHint`, the value `'1'`, through `core/providers/session.ts`) means "this
browser signed in". With the hint, start-up reads `GET /api/user/me`
(`core/initializers/session.initializer.ts` starts `authStore.restoreSession()`, never awaited by
the mount) and a 401 may trigger a refresh; without it a visitor's page load calls neither. A
login or register sets it, a sign-out or a refused refresh clears it, and a network error or an
outage keeps it. Never store anything else under it, and never branch on it outside the auth
store, the session initializer and the auth interceptor. The restore is capped at 5 s
(`SESSION_RESTORE_TIMEOUT_MS`): after the cap the app is a visitor for good, a late answer is
discarded, and a guarded deep link lands on sign-in with `next`.

**The form recipe, by example.** `features/auth/auth.form.ts` is the pattern: one function per form
(`loginForm()`, `registerForm()` with `match('password', 'confirm')` as its rule, `otpForm()`),
each `useZodForm(schema, initial, rules?)` (`shared/validators/zod-form.ts`) over the generated
request schema (`zCredentials`, `zOtpVerificationBody.pick({ code: true })`), so no limit is
copied. The file's first import is `@/shared/validators/zod-config` (see below). `useZodForm`
returns `values` (the reactive object `v-model` binds), `error(name)`, `errorText(name)`
(translated, for a field's `error` prop), `touch(name)`, `submit(handler)`, `submitting`,
`submitted`, `valid`, `unmapped`, `serverErrors` and `reset()`; call it in `setup`, it reads the
installed i18n. An error shows once its field is touched (`@blur="form.touch('email')"`) or the
form was submitted, and the first issue per field wins. `submit` validates, calls the handler with
the parsed value (a field the schema lacks, such as `confirm`, is not in it) and ignores a second
call while it runs; an invalid form calls nothing. The page composes
`<form novalidate @submit.prevent="submit">`, one
`<FormField :label="$t('auth.email')" :error="form.errorText('email')">` around each control
(`<AppInput v-model="form.values.email" type="email" autocomplete="email" />`) and
`<FormActions :pending="loading" />`. The field gives the control its id and `aria-invalid` /
`aria-describedby` through `FORM_FIELD_KEY`. Error text is `errors.<key>` in `en.json` (`required`,
`email`, `minlength`, `maxlength`, `min`, `max`, `pattern`, `invalid`, `match`; lengths fill
`{min}` and `{max}`). A field the contract names is never re-validated by hand, even when the
control needs a looser shape (`user.form.ts` widens the generated phone rule to accept `''`,
meaning "remove the number", and keeps the rule itself). A checkbox carries its own label: give its
field no `label`.

**zod and the CSP.** zod 4 probes `new Function('')` at its first parse, a violation of the
deployed `script-src 'self'`. `shared/validators/zod-config.ts` calls `z.config({ jitless: true })`;
`main.ts` imports it, and so must every module that imports `zod` or `@/services/generated/zod.gen`
at run time, as its first import (the build splits shared code into chunks, so `main.ts` alone is
not enough). A new `*.form.ts` begins `import '@/shared/validators/zod-config'`;
`tests/unit/zod-config.spec.ts` fails the module that does not.

## Styling

Global SCSS in `src/styles/`, imported once from `main.ts`; components carry no styles
(`tests/unit/styles-tree.spec.ts`). The structure: `setup/` (variables, breakpoints, functions,
mixins, typography; emits no CSS), `themes/` (`brand.css` holds the generated brand tokens in plain
CSS, `_light.scss` and `_dark.scss` the product's additions), `basics/` (helpers, base, layout),
`components/` (one partial per shared or layout component, forwarded from `_index.scss`) and
`views/` (one partial per screen). `styles.scss` `@use`s setup, themes, basics, components, views,
in that order. Breakpoints `sm` 576, `md` 768, `lg` 1024, `xl` 1280, `xxl` 1536, mobile first
(`@include up(md)`); spacing on a 4 px base (`space()`, `z()`).

- **Rules for a component.** Render class names only: no `<style>` block (scoped or not), no
  `style` attribute (static or bound), no stylesheet import. A new component gets
  `components/_<name>.scss`, forwarded from `components/_index.scss`; a new screen gets
  `views/_<name>.scss` forwarded from `views/_index.scss`. Class names are BEM
  (`.page-header__actions`); a partial `@use`s `../setup/...` for the functions and mixins it
  needs. Never write a whole-line `// @word` comment in SCSS: the generator reads it as a marker.
- **Tokens.** Colour, radius and font come from the custom properties (`var(--primary)`,
  `var(--surface-2)`, `var(--focus-ring)`); never a literal colour. `_light.scss` and `_dark.scss`
  hold the same keys. `<html data-theme>` selects the dark values; `public/theme-init.js` (a file,
  never inline, because of the CSP) sets it before first paint and `store/theme.store.ts` keeps it
  in step. `THEME_COLORS` in `core/config/constants.ts` mirrors the two `theme-color` metas of
  `index.html` (`tests/unit/theme-color.spec.ts` guards the drift).
- **Logical properties only** (`margin-inline`, `padding-block`, `inset-inline-start`,
  `text-align: start`): the layout mirrors under `dir="rtl"`, so no `left`, `right`,
  `margin-left` and the like (`tests/unit/rtl-styles.spec.ts`). Check a new component with
  `<html dir="rtl">` (the language toggle sets it).
- **44 px.** Every control spans at least 44 px under `(pointer: coarse)`, whatever
  `data-density` says: use `@include touch-target` on any new control.
- **Icons.** One set: `shared/components/app-icon.vue` over `lucide-vue-next` (the entries of
  `icons.ts`). One concept, one icon; a new concept adds an entry there, never a second set.
- **Toasts.** One implementation: `store/notification.store.ts` holds the list and
  `layout/components/toast-host.vue` renders it through Reka Toast. A toast may carry one action
  (`{ labelKey, run }`; only `showInfo` and `showWarning` take it): it never times out and is
  dismissed when the action runs.
- **Theme toggle.** One toggle for everyone, in the header, a ghost icon button that cycles light,
  dark and system. The account menu holds avatar, email, profile and sign out, and no theme
  control.
- **Copy.** Every user-visible string goes through `$t('notFound.title')` in a template or `t` from
  `useI18n()` in script, with its key in `core/i18n/translations/en.json`, nested by area, `{param}`
  for values, and the same key in `he.json` when the `i18n` flag is on. vue-i18n is installed in
  both modes, so nothing branches on the flag.
- **Flag off (`i18n`).** The language toggle, `he.json`, `languages.ts`, the language store and
  initializer and the RTL spec are gone; the English table stays bundled and every `t` call site
  is unchanged.
- **Width.** A form lives in a card or a view no wider than `26rem` (`auth-card`) or `40rem`
  (`views/_profile.scss`, `_health-status.scss`); do not stretch a form field across the container.
- **Text props and labels.** A component prop that carries text takes an already translated string,
  and the heading prop of `PageHeader`, `EmptyState` and `ErrorState` is `heading`, never `title`.
  An `AppButton` with `size="icon"` needs an `aria-label`; dev mode logs a console error when it
  is missing. A prop named `...Key` (`submitKey`, `cancelKey`, `emptyKey`, `captionKey`) takes a
  key of the copy table and translates it itself.
- **Drawer.** Below `lg` the side nav is a modal drawer (a Reka Dialog): focus moves in and stays,
  the page behind is `inert`, Escape or navigation closes it and focus returns to the toggle.
- **Raw controls** (`<button>`, `<input>`, `<select>`, `<textarea>`) exist only under
  `shared/components/`; a feature never writes one. `AppButton` also renders a router link (`to="/"`)
  so navigation and actions look the same.

**The components** (`shared/components/<name>.vue`; the rubric names of the `ui-design` skill):

| Component                                                 | What it is                                                                                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-button` (`AppButton`)                                | The one `<button>` (or a link with `to`); `variant`, `size`, `loading`, `aria-label` for `size="icon"`.                                                                          |
| `app-icon`                                                | The one icon set; `name`, `large`.                                                                                                                                               |
| `form-field` (`FormField`)                                | Label, hint, the default-slot control and its error (below).                                                                                                                     |
| `app-input`, `app-select`, `app-textarea`, `app-checkbox` | The controls; each takes `v-model` and emits `blur`. `app-input` has `type` and a password toggle; `app-select` and `app-checkbox` are Reka primitives.                          |
| `form-actions` (`FormActions`)                            | Submit (`pending` shows the spinner and disables; `submitKey`) and optional cancel (`cancellable`, `@cancelled`); stacked on phones.                                             |
| `page-header` (`PageHeader`)                              | Page heading, description and an `actions` slot.                                                                                                                                 |
| `data-table` (`DataTable`)                                | `columns`, `rows`, a `cell` slot, `captionKey`, an empty state; scrolls inside its container.                                                                                    |
| `app-modal`, `confirm-dialog`                             | `AppModal` (`title`, `size`, `v-model:open`) is the dialog; `ConfirmDialog` (`title`, `message`, `danger`, `@confirm`, `@cancel`) is the confirm pattern; both over Reka Dialog. |
| `app-toast`                                               | One toast, presentational; the list is rendered by `layout/components/toast-host.vue`.                                                                                           |
| `empty-state`, `error-state`                              | What a list shows with nothing to show, and what a failed load shows (`heading`, `description`, `@retry`).                                                                       |
| `app-skeleton`, `app-spinner`                             | Loading placeholders; the spinner is a status region unless `decorative`.                                                                                                        |
| `Page` (rubric)                                           | No component: the route's page `.vue` is the page, inside `<main id="main">` of the layout, with its view partial (`views/_<name>.scss`) setting the width and spacing.          |
| `Section` (rubric)                                        | No component: a `<section>` with its own heading in the page, styled by the view partial.                                                                                        |
| `ListSkeleton`, `CardSkeleton` (rubric)                   | `AppSkeleton`: `:lines="n"` for a list of rows, `variant="block"` for a card.                                                                                                    |

<!-- @server:auth-start -->

With the server's `auth` flag, `shared/components/auth-card.vue` (`AuthCard`) is the sign-in and
sign-up card, 26rem wide: props `heading` (required) and `description`, the default slot for the
form and a `footer` slot for the alternate link. The file exists only with `auth`.

<!-- @server:auth-end -->

Beside them: `shared/directives/autofocus.ts` (`v-autofocus`: focuses the element, or the first
control inside it, once after mount), `shared/composables/` (`use-media-query.ts`,
`use-unique-id.ts`: pure Vue, no store) and `shared/utils/` (Vue has no pipes, so they are
functions: `relativeTime(iso, lang)` "3 minutes ago" in the active language, `formatPhone(e164)` a
grouped display with anything else unchanged, and the pure `time.ts`: `parseTime`, `differenceIn`,
`isSameDay`).

**The header's optional parts.** A `.vue` file takes template block markers only (a trailing
marker or a marker inside `<script setup>` is never written), so no `.vue` file imports a file that
exists only with a flag. `layout/components/slots.ts` is the one file the generator resolves:
`accountSlot()`, `languageToggle()` and `installButton()` each return the component on a marked
line, or `null` on the unmarked twin, and the header renders what they answer. A new optional part
of the shell follows the same pattern.

## Errors

The error interceptor maps a failed call to an `ApiError` and nothing else; the store method that
awaited the call shows the outcome.

- **`ApiError`** (`models/api/response.ts`, a plain object so it can sit in state): `code`,
  `status?`, `requestId?` (the envelope's, else the `x-request-id` header), `fieldErrors?` (path ->
  codes, from a validation envelope's `details`) and `context?` (where a cause that was no
  `ApiError` came from; logged, never shown). `isApiError()` is the guard. The server's `message`
  and `details` text are never kept or shown.
- **Codes.** The envelope's: `validation_failed`, `unauthenticated`, `forbidden`, `not_found`,
  `conflict`, `payload_too_large`, `unsupported_media_type`, `rate_limited`, `internal`,
  `upstream_unavailable`. Ours: `network` (no response), `unknown` (not the envelope, or a code the
  table lacks), `validation` (a client check that failed before any request).
- **Copy table.** Each code has `errors.<code>` in `en.json`, plus `errors.offline` and
  `errors.unexpected`. `errorMessageKey(code)` returns the key, `errors.unknown` for anything else;
  a code added to the contract fails the build in `models/api/error-copy.ts` until it is listed, and
  a spec compares the list with `en.json`.
- **Failure rejects.** The client is configured with `throwOnError: true` and each facade call
  repeats it, so a facade returns the call's `data` and a failure rejects with the `ApiError`. The
  awaiting store method catches it and toasts through the copy table. A store toasts once per
  failure, reads included, and keeps the `ApiError` in `error` for the page.
- **Interceptors.** `core/config/api-client.ts` sets the client's `fetch` to
  `withLoading(withRefresh())`: loading outermost, so one exchange counts once even when the
  refresh replays it (`withRefresh`, auth only, sits inside). `core/interceptors/error.interceptor.ts`
  is a Hey API error interceptor, registered once by `installInterceptors()`
  (`http.provider.ts`, called from `app/plugins.ts`): it turns the envelope into an `ApiError` and
  a thrown `fetch` into `network`. No interceptor toasts. `toApiError(cause)` stays the belt in the
  store for anything else.
- **401 and the session (with auth).** `withRefresh` turns a 401 into one refresh and one replay,
  only for the app's own `/api/` (same origin), when the session hint is set and the request is not
  an exempt call (`/api/auth/login`, `register`, `refresh`, `otp`, `otp/verification`: they answer
  401 for reasons a refresh cannot fix; the exemption is by URL). It does the refresh itself with
  the global `fetch`, never through the store. Concurrent 401s share the one in-flight refresh; a
  replay that fails again reaches the caller, and so does the original 401 when the refresh fails.
  Sign-out is not exempt: with only the refresh cookie left it needs a refresh to revoke the
  session. `unauthenticated` reads "Your session has expired. Sign in again." everywhere except
  sign-in, where the store shows `auth.login.invalid`; `forbidden` reads "You do not have access
  to this." and a role the account lacks goes to `/forbidden` instead.
- **A refused refresh ends the session on screen.** When the refresh answers 400, 401 or 403, the
  wrapper clears the hint and emits `sessionLost` (`core/providers/session.ts`); the session
  initializer calls `authStore.forget()` and pushes `/auth/login?next=<current url>` through
  `toLogin` (the helper `authGuard` uses). It does not navigate while `authStore.restoring` is true
  (the start-up probe of `/api/user/me` on a public page must not bounce a visitor; the guards
  protect guarded routes), nor when already on a login URL, nor after a network error or 5xx (the
  session may be fine; the hint stays).
- **Field errors.** The auth store's `Overrides` map gives one code a better message for one call;
  a `null` value means "the page shows this code itself": the store toasts nothing. The store never
  toasts `validation_failed`, and `register` passes `{ conflict: null }`. On a `validation_failed`
  the page calls `applyFieldErrors(form, error)` (`shared/validators/server-errors.ts`): each path
  in `fieldErrors` that names a field gets `errors.invalid` and shows in its field; the unmapped
  paths come back and the page toasts `errors.validation_failed` once for them (none: nothing). A
  taken email (`conflict`) lands on the email field with `auth.register.conflict`
  (`form.serverErrors.email = { messageKey: 'auth.register.conflict' }` and `form.touch('email')`).
  A field error is never also a toast, and any other code toasts its own copy.
- **Toasts.** `useNotificationStore().showError('errors.unexpected')`, a key of the copy table,
  fires from the handler that awaited the work, never from an interceptor or a watcher.
- **Failure state.** A page whose load failed shows `<ErrorState>` with the mapped description and
  a retry that calls the store method again.
- **Last resort.** `installGlobalErrorHandler` (`core/errors/`) takes `app.config.errorHandler` and
  `unhandledrejection`, logs through the logger and calls back for one `errors.unexpected` toast;
  `core/errors` imports no store. An error a handler can name is shown there, not here.

## Tests

- Unit tests run with `bun run test` (`vitest run` on jsdom, Testing Library for Vue). Specs are
  co-located with the code, `src/**/*.spec.ts`. Checks on files outside `src/` (the ESLint config,
  the styles tree, the Playwright config, the translations) live in `tests/unit/*.spec.ts`, each
  starting with `// @vitest-environment node`. `vitest.config.mts` sets `allowOnly: false`,
  `passWithNoTests: false` and `unstubGlobals: true`; `vitest.setup.ts` supplies the `matchMedia`,
  `ResizeObserver` and pointer-capture stand-ins Reka needs.
- **The API is the one boundary a test fakes.** `stubApi({ 'GET /api/health': Response.json(...) })`
  (`src/testing/stub-api.ts`) replaces the global `fetch`, keyed `METHOD /path`; unlisted calls
  answer 404. A facade is tested through it, with the real generated client behind.
- **A store** is tested on a fresh `createPinia()` with either `stubApi` (the real facade and
  client behind it, as `auth.store.spec.ts`) or `vi.spyOn` on one facade method (as
  `health.store.spec.ts`), never a module mock of a facade (the one `vi.mock` in a store spec
  replaces the virtual `virtual:pwa-register/vue` module, in `app-update.store.spec.ts`); **a
  page** with
  `renderWithApp(Page, { route, initialState })` (`src/testing/render.ts`): a testing Pinia
  (`stubActions: false`), a memory-history router over the real route table and the English copy in
  memory, so assertions read the same with the `i18n` flag on or off. Query by role and name, as a
  user would.
- `src/testing/` is imported only by `*.spec.ts`; `auth-fixtures.ts` (auth only) holds the account
  fixtures.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`) and run with
  `bun run test:e2e`. Install the browser once with `bunx playwright install chromium` (add
  `--with-deps` on Linux).
- **Two modes.** By default `playwright.config.ts` starts the API fresh (`reuseExistingServer:
false`, `RATE_LIMIT_SCALE=100`) and then `bun run build && bun run preview`: the production
  bundle behind `vite preview`, which forwards `/api` to the API, so the page and the API share one
  origin as in the image. With `E2E_BASE_URL` set (a blank value counts as unset) it tests that
  URL and starts nothing; the catalog's case runner does this against the Compose stack. The API
  there runs at rate-limit scale 1 with one per-address bucket, so the suite can run about once per
  15 minutes per stack, and it leaves its accounts in that stack's database.
- **Service workers are blocked** (`serviceWorkers: 'block'`), so a registered worker never serves
  a stale shell or API answer to a test. `retries: 0`, `forbidOnly`, and a trace is kept on
  failure: a test that passes only on a retry is a failure. The trace stores request bodies (the
  synthetic test password and e-mails) under `test-results/` (git-ignored), so never point the
  suite at real accounts. The console assertion (`collectConsoleProblems` in `tests/e2e/support.ts`)
  filters exactly two signatures: Playwright's "Service Worker registration blocked by Playwright"
  and vite-plugin-pwa's "Service worker registration failed ... reading 'waiting'" (a blocked
  registration resolves to nothing). Do not widen the filter.

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
  one of them carries `@phone` or `@desktop` in its title and the other project's `grepInvert`
  leaves it out, so nothing skips at run time; never a `test.skip`.
- **Specs.** `shell.spec.ts` asserts the landmarks, the skip link, no horizontal overflow, the
  44 px touch targets (phone, also with `data-density="compact"`) and the desktop densities.
  `smoke.spec.ts` shows the health status the API returns. `screens.spec.ts` captures every screen
  in phone and desktop, light and dark, to `test-results/screens/<route>-<viewport>-<theme>.png`
  (QA reads them) and checks each: no axe violation of the WCAG A and AA tags (in dark this is the
  contrast measurement), no horizontal scroll, exactly one `h1`. A failure names the route, theme
  and project with the rule ids and targets.
- **Screen routes.** `tests/e2e/screen-routes.ts` builds the list from `src/app/nav.ts`, so a nav
  entry is covered with no edit. A route that is not in the nav (an auth screen) is added to
  `AUTH_ROUTES`; a route that needs an account is added to `SIGNED_IN_ROUTES` instead, because
  signed out it is the sign-in redirect and would write the same screenshot name. A nav entry with
  `roles` must be listed in `SIGNED_IN_ROUTES`; one that needs a role the test account lacks gets
  a `setup` the project writes in `tests/e2e/auth-support.ts`. The `SetupAccount` a setup receives
  has a `databaseUrl` member only when the server has a database (its line carries
  `// @server:database`), so a setup that touches it without one fails the typecheck.

<!-- @server:auth-start -->

- **Signed in.** `SIGNED_IN_ROUTES` (`/profile`, `/auth/verify-otp`) are captured after
  `registerThroughApi`, which signs up through the API (the cookies land in the browser context)
  and plants the session hint (`localStorage` key `session-hint`, the JSON string `"1"`). Entries
  share one account per project because the register route is rate limited. `auth.spec.ts` covers
  sign-up, sign-in, the profile, sign-out, a wrong password, a taken email on its field, the
  guarded redirect with `next`, and two calls that expire together sharing one `/api/auth/refresh`.
  An e2e that forces a theme writes the JSON-quoted value (`setTheme`).

<!-- @server:auth-end -->

- The data rule: a journey creates its data through the API or the UI with a name unique per run
  (`uniqueEmail`), and never takes the database's contents as a precondition.
- Every new behaviour gets a test for the happy path and at least one for a failure or empty
  path. No `.skip`, `.only`, `test.fixme` or `describe.skip`; a removed test is named in the
  report.
- `bun run check` runs the typecheck (`vue-tsc -b`, which covers templates; `tsc` does not), lint,
  the format check and the unit tests. In-place `bun run build` fails on the `__THEME_*__`
  placeholders in `brand.css` until a project is generated; the generated project's build and e2e
  are the gate.

## Deployment

- `bun run dev` serves the app (Vite) on the template's port and proxies `/api` to the server's
  port (`vite.config.ts`).
- `bun run build` writes `dist/` with `index.html` and the content-hashed files under `assets/`.
  The app calls the API at relative `/api`, so whatever serves `dist/` also routes `/api` to the
  server.
- **Service worker (the `pwa` flag).** `vite-plugin-pwa` (`registerType: 'prompt'`) emits the
  manifest, `sw.js`, `registerSW.js` and `workbox-*.js` into `dist/`; the worker registers in
  production only. It precaches the shell, never answers an `/api/` navigation with it, and caches
  one API response, `/api/health` (network first, 3 s timeout); never `/api/user/**` or
  `/api/auth/**`. A feature adds a URL to `runtimeCaching` in `vite.config.ts` only for a public
  read that carries no session or personal data; never `/api/**`.
- **How an update reaches the user.** `store/app-update.store.ts` holds `needRefresh` and
  `updateServiceWorker`; `core/initializers/pwa.initializer.ts` checks at start, hourly and on
  window focus. When a version is ready, an info toast offers `pwa.reload`; the action activates it
  and reloads the page. Serve `sw.js`, `registerSW.js`, `workbox-*.js`, the manifest and
  `index.html` with `Cache-Control: no-cache` (`nginx/default.conf` does).
- **Install.** The manifest is configuration in `vite.config.ts` (its theme and background colours
  are `#ffffff`; change them to the brand) and the placeholder icons are in `public/icons/`
  (`icon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`).
  **Replace the icons** with the product's own. The header shows an install button when the browser
  offers one, and a hint on iOS Safari (no install event there).
- **Flag off.** Without `pwa` the plugin lines, `vite-plugin-pwa` and `workbox-window`, the icons,
  the stores, the initializer and the header control are gone, and the build emits no worker.
- The app calls the API at relative `/api` on its own origin in every environment: no API URL is
  compiled into the bundle and there is no CORS. Whatever serves `dist/` must also route `/api` to
  the server (a reverse proxy, or the server serving the files itself).
- **Two modes**, chosen at generation (`--deploy`).
  - `single` (default): one container. The server serves `dist/` and `/api` on its own port
    (published on every interface), so the page is on the server's port and the template's port is
    dev-only.
  - `split`: two containers. This package's nginx serves the files on the template's port
    (published on every interface, the public edge) and proxies `/api/` to the server, which is
    published on loopback only.
- **`Dockerfile` targets.** `build` is `oven/bun:1.4-alpine`: a frozen install and
  `bun run build`. `dist` is `FROM scratch` and holds only the built files at `/dist`: the
  server's image copies it. `serve`, the last and so the default target, is
  `nginxinc/nginx-unprivileged:1.31.7-alpine` with the files at `/usr/share/nginx/html`; it runs as
  uid 101, listens on `PORT` and has a `wget` healthcheck. `.dockerignore` keeps environment files,
  tests and source maps out of every image.
- **nginx files**, in `nginx/`. `default.conf` is the config template (copied to
  `/etc/nginx/templates/default.conf.template`; the entrypoint renders it with `envsubst` over
  `PORT` and `API_URL`). Cache policy per file class: `/assets/*` is `immutable` for a year;
  `index.html`, the worker files (`pwa`) and any other file are `no-cache`; an extension-less path
  is `index.html`; a missing file with an extension, a dotfile and a bare `/assets/` are 404 (never
  a listing); a path above the root is nginx's own 400; `/api/` is proxied with `X-Forwarded-For`
  and the server's own headers pass through. Keep three rules when editing: no `add_header` at
  server level (a location with its own drops the inherited ones), no dollar sign in a comment
  (`envsubst` rewrites it), and no environment variable named like an nginx variable (`host`,
  `uri`).
- **Content Security Policy.** `security-headers.conf` holds the headers of helmet 8.3.0 and is
  included by each static location. `script-src 'self'` (no inline script: `theme-init.js` is a
  file, and zod runs in `jitless` mode, see Adding a feature). With `pwa` the policy also carries
  `worker-src 'self'` and `manifest-src 'self'` (the `# @pwa` lines). A project that loads a font,
  an image or an API from another origin widens the matching directive there, and nowhere else.
- **Compose fragment** (`compose.yaml`), per mode. `single`: `build: { context, target: dist }`
  with `scale: 0`, so the image is built and no container runs; the server's build reads it as
  `additional_contexts: spa: service:<dir>`. This needs **Docker Compose 2.35.0 or newer**.
  `split`: `target: serve`, `ports`, `API_URL` (the server's name and port on the Compose
  network), `depends_on` the server, and the `app` profile. Run with
  `docker compose --profile app up --build --wait`; stop with
  `docker compose --profile app down`, because a plain `down` does not see profile services.
- **`TRUST_PROXY`** is the server's. `single`: `false`, because nothing sits in front of it.
  `split`: `1`, because nginx is the one hop and sets `X-Forwarded-For`. Raise it by one for every
  proxy placed in front of the edge. The Vite dev and preview servers forward the client address
  as 127.0.0.1 only, so a rate-limit test there shares one bucket.
- **Cookies and TLS.** The API sets the session cookies `Secure` outside development, so a
  non-loopback host needs TLS at an edge, while the CSP carries `upgrade-insecure-requests` and
  `Strict-Transport-Security`. In `split` nginx sends `X-Forwarded-Proto: $scheme` (always `http`
  at this hop): behind a TLS edge, forward the edge's value (`$http_x_forwarded_proto`) in the
  `/api/` location and make the server's `TRUST_PROXY` count the edge too.
- **Body size.** nginx's `client_max_body_size` is its 1 MB default, as is the servers' cap, so an
  oversize body gets nginx's own 413 page. To accept more, raise the server's limit and set
  `client_max_body_size` in the `/api/` location to match.
- **What a project changes.** The brand colours and icons of the manifest, the CSP directives for
  any origin it adds, `client_max_body_size`, and the Compose lines when it switches mode (copy the
  other mode's lines from `compose.yaml` of the catalog's template).
