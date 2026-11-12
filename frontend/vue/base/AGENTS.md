<!-- @noserver-start -->
The layer map of this package. Commands are in `package.json`.
<!-- @noserver-end -->
<!-- @server-start -->
The layer map of this package. Commands are in `package.json`; the contract code in `src/services/generated/` is generated, never edited.
<!-- @server-end -->

**`src/`**

- `main.ts`: imports the font, `styles/themes/brand.css`, `styles/styles.scss` and
  `shared/utils/validation`, creates the app, calls `installPlugins(app)` and mounts in its
  `.then` (the saved language loads before the first render). It installs
  `core/initializers/preload-error`: one reload per 30 s on `vite:preloadError` (a chunk the new
  build no longer has), then the error surfaces.
- `app/`: the wiring; no product logic, no fetch. `App.vue` (a `<RouterView />`), `plugins.ts`
  (`installPlugins`: Pinia, router, i18n, the error interceptor, the global error handler, the
  `has-role` directive and `ROLES_KEY`, the session and PWA initializers), `routes.ts` (the main
  layout, one lazy `*.routes.ts` per page module, the catch-all last; the auth layout and its
  routes with auth), `router.ts` (sets `document.title` from
  `meta.titleKey`) and `nav.ts` (the one navigation table, read by `screens.spec` and by the navigation a product
  builds; `NavEntry` lives in `models/nav/`).
- `core/`: singletons wired once in `app/plugins.ts`, never imported by `shared/`.
  `config/` (`env.ts` the only reader of `import.meta`, `constants.ts` with the `STORAGE_KEYS`,
  `api-client.ts` the generator's `runtimeConfigPath`), `interceptors/`, `guards/`,
  `initializers/`, `providers/` (storage, logger, theme DOM helpers and, with auth, the session
  hint: platform wrappers with no reactive state), `i18n/` (vue-i18n with English bundled; with
  the `i18n` flag also `languages.ts` and `translations/he.json`), `errors/`.
- `layout/`: the app-wide components, every one `app-*` in a folder of its name (a lone file stays a
  file) with its `.scss` and spec beside it when styled. `app-main-layout` (the skip link, the one `<main id="main">` and the toast host; no
  header, navigation or footer, see "The shell") and `app-toast-host`. A component the product
  places: `app-theme-toggle`. A component goes here when a layout composes it or it reads a store;
  a reusable control or pattern goes to `shared/components/`.

<!-- @server:auth-start -->

- With auth: `app-auth-layout` (centred card, no shell) and `app-account-menu`, which the product
  places.

<!-- @server:auth-end -->
<!-- @i18n-start -->

- With `i18n`: `app-language-toggle`, which the product places.

<!-- @i18n-end -->
<!-- @pwa-start -->

- With `pwa`: `app-install-button`, which the product places.

<!-- @pwa-end -->

- `pages/<module>/`: one directory per server module or screen group, named for the glossary
  noun: `<module>.routes.ts` (a default export of `RouteRecordRaw[]`), the routed
  `<name>-page/` folders beside it (each holds `<name>-page.vue`, which reads a store, with its
  `<name>-page.scss` and spec), when needed `<module>.form.ts` (a form over the generated
  schemas); the module's own presentational pieces sit beside the pages (a folder of their name
  when they have a sheet or a spec), never in a `components/` folder. A page never imports another
  module. `home/` is the index route and `not-found/` the catch-all.
- `store/`: every Pinia store, all setup stores. The domain stores (one per server
  module; with auth `auth` and `user`) and the app-state stores (`theme`, `notification`,
  `network`, `loading`; `language` with `i18n`; `app-update` and `install-prompt` with `pwa`),
  plus `request-status.ts`. The import rule is the same for both kinds.
<!-- @server-start -->
- `services/`: one facade per server module over the generated SDK; `generated/` is the Hey API
  output (types, the fetch client, the flat SDK, zod; committed, lint-ignored).
<!-- @server-end -->
- `shared/`: product-agnostic. `components/` (the `base-*` primitives that wrap the browser
  controls once, and the patterns, each a folder of its name with its `.scss` and spec beside it;
  the form controls, `form-field` and `form-actions` in `components/form/`; the four controls
  stay files there because they share `controls.scss`, with one `form-controls.spec.ts`), `directives/`,
  `composables/`, `validators/`, `utils/`.
- `models/`: one folder per noun, holding only `interface.ts`, `type.ts` (re-exports of the
  generated types plus UI-only shapes), `enum.ts` and `constant.ts`, each when needed; no
  function, schema or spec lives there (a helper goes to `shared/utils/`, `services/` or
  `core/config`).
- `testing/`: helpers imported only by `*.spec.ts`.
- `styles/`: global and app-wide CSS only: `styles.scss`, `setup/`, `themes/`, `basics/` (see Styling).

**No scaffolder.** Never run `create-vue`, `npm create vue` or any generator inside this package:
they scatter files against the layer map and default to `<style scoped>` and Options API files.
Write the files by hand, copying the nearest sibling.

**Where does X go**

| Addition                                    | Home                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| A noun's types, enums, labels               | `models/<noun>/`                                         |
| A read or write on a server module          | `services/<module>.service.ts`                           |
| State a page reads, and the methods on it   | `store/<noun>.store.ts`                                  |
| A routed screen                             | `pages/<module>/<page>-page/<page>-page.vue` + `.scss`   |
| A presentational piece of one module        | `pages/<module>/<piece>/<piece>.vue` + `.scss`           |
| A form                                      | `pages/<module>/<module>.form.ts`                        |
| An app-wide component (a header, a menu)    | `layout/app-<name>/app-<name>.vue` + `app-<name>.scss`   |
| A primitive (button, input, dialog)         | `shared/components/base-<name>/base-<name>.vue`          |
| A reusable pattern or composable            | `shared/`                                                |
| A guard, interceptor, initializer, provider | `core/`                                                  |
| A navigation entry                          | `app/nav.ts`                                             |
| A stylesheet                                | beside its component or page, referenced by it           |
| A copy string                               | `core/i18n/translations/en.json` (and `he.json`, `i18n`) |

**Naming.** Files are kebab-case, and a component is PascalCase in a template:
`home-page.vue` renders as `<HomePage>`. `<script setup lang="ts">` and the
Composition API only. A primitive carries the `Base` prefix (`base-button.vue`,
`<BaseButton>`; `vue/multi-word-component-names`), an app-wide component the `App` prefix
(`app-theme-toggle.vue`, `<AppThemeToggle>`). A file that is not a component takes a suffix:
`*.store.ts`, `*.service.ts`, `*.guard.ts`, `*.interceptor.ts`, `*.routes.ts`, `*.form.ts`,
`*.initializer.ts`; a composable is `use-kebab.ts` and exports `useKebab`. Cross-layer imports use
the alias `@/*` (`src/*`); imports inside one page module stay relative. Specs sit beside the file as
`*.spec.ts`.

**Import rules** (`eslint-plugin-boundaries`; each lint message names the layer to use instead):

| From                                                                                                          | May import                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`                                                                                                        | components, pages (`*.routes.ts` only), core, store, shared, models; never `services/`                                                                 |
| `main.ts` (the entry)                                                                                         | app, core, shared, models                                                                                                                              |
| `layout/`                                                                                                     | `core/config`, `core/providers`, store, shared, models                                                                                                 |
| `pages/<m>/` screens (`*-page.vue` and any other `.ts` beside them, not `*.routes.ts` or `*.form.ts`)        | store, shared, models, `core/config`, `core/providers`, `core/guards` (the unsaved-changes composable), its own module's components and `*.form.ts`     |
| `pages/<m>/` components (a `.vue` that is not a `*-page.vue`)                                                 | shared, models                                                                                                                                         |
| `pages/<m>/*.routes.ts`                                                                                       | `core/guards`, its own module's pages                                                                                                                  |
| `pages/<m>/*.form.ts`                                                                                         | `shared/validators`, `shared/utils/validation`, models, the generated zod schemas (`@/services/generated/zod.gen`)                                     |
| `store/`                                                                                                      | store, services, models, `core/providers`, `core/config`, `core/i18n` (the language store applies the locale)                                          |
| `services/`                                                                                                   | models, `core/config`, `services/generated`                                                                                                            |
| `core/guards`, `core/initializers`, `core/interceptors/error.interceptor.ts`, `http.provider.ts`              | store, services, core, shared, models (they are the wiring); `http.provider.ts` alone imports the generated client                                     |
| `core/interceptors/loading.interceptor.ts`                                                                    | `core/config`, `core/providers`, models and `store/loading.store.ts`                                                                                   |
| `core/interceptors/auth.interceptor.ts`                                                                       | `core/config`, `core/providers`, models: a leaf, never `store/`, `services/` or another interceptor                                                    |
| `core/config`, `core/providers`, `core/i18n`, `core/errors`                                                   | each other, shared, models; `core/config/api-client.ts` alone also the two fetch wrappers                                                              |
| `shared/`                                                                                                     | shared, models                                                                                                                                         |
| `models/`                                                                                                     | models; the generated types and zod schemas with `import type` only                                                                                    |
| `testing/`                                                                                                    | anything; nothing outside a `*.spec.ts` imports it                                                                                                     |

- A page module never imports another page module, and no page renders a `layout/` shell piece. A page that needs a one-off request adds a facade
  method and a store method first.
<!-- @server-start -->
- The generated runtime (`client.gen`, `sdk.gen`, the barrel) is imported only in `services/` and
  `core/interceptors/http.provider.ts`; `zod.gen` is the one generated file a `*.form.ts` may also
  import. `store/`, `core/` and `models/` take the generated types with `import type`; every other
  layer reads the contract's types through `models/<noun>/`.
- The two fetch wrappers (`loading.interceptor.ts`, `auth.interceptor.ts`) are leaves of the client
  config, which imports them: if one imported a store or a service the graph would be a cycle
  `client -> config -> wrapper -> store -> services -> client`.
<!-- @server-end -->
- `fetch(` (the global) is called only in `core/interceptors/auth.interceptor.ts`; `import.meta`
  only in `core/config/env.ts` (`no-restricted-syntax`).
- `<button>`, `<input>`, `<select>` and `<textarea>` appear only inside `shared/components/`
  (`vue/no-restricted-html-elements`, off for that directory; the message names the `Base` wrapper).
  A `<style>` block is empty and points at a sibling sheet (`vue/block-lang` pins `lang="scss"`;
  `tests/unit/styles-tree.spec.ts` refuses `scoped` and a block with a body), no `style` attribute
  (`vue/no-static-inline-styles`, and the scan also reads bound ones), no `.css` or `.scss` import
  outside `main.ts`.
- A file in a directory no layer claims is an error (`boundaries/no-unknown-files`), and so is importing one (`boundaries/no-unknown-dependencies`). The boundary
  rule is silent on an import it cannot resolve, so `eslint-import-resolver-typescript` reads the
  `@/*` alias from `tsconfig.app.json` and resolves `.vue` imports; keep the setting when the
  config changes.

`tests/unit/eslint-boundaries.spec.ts` lints one violation and one allowed case per rule, through
the real `eslint.config.mjs`. A new rule gets a case there.

<!-- @server-start -->
The API is always reached at relative `/api` on the page's own origin (see Deployment), so the
bundle carries no API URL.
<!-- @server-end -->

## Adding a feature

<!-- @noserver-start -->
This package has no server, so the sections below that read data (`services/`, the generated SDK,
`ApiError`, interceptors, request stores, `stubApi`, the `/api` proxy) describe what arrives with
one:

- `openapi-ts.config.ts`, the `api:types` script, `@hey-api/openapi-ts` and `src/services/generated/`.
- `core/config/api-client.ts`, `core/config/error-copy.ts`, `core/interceptors/`, `models/api/`,
  `services/api-error.ts` and `store/request-status.ts`,
  `store/loading.store.ts`.
- `shared/validators/server-errors.ts` and `testing/stub-api.ts`.
- The dev and preview proxy in `vite.config.ts`, nginx's `/api` upstream, the service worker's
  `/api` rules and the e2e API web server.

The harness adds them with the server (`scripts/scaffold.mjs`); never copy them by hand.
The layer map and the lint fences above already name those layers (`services/`, `core/interceptors/`,
the generated client); none of their files exists yet.

A feature is a page module `pages/<noun>/` (`<noun>.routes.ts` with a lazy component and
`meta: { titleKey }`, and `<noun>-page/<noun>-page.vue` wrapped in `PageContainer` with its sibling `.scss`), a setup
store in `store/` when state is shared, and types in `models/<noun>/`. Spread the routes into the main
layout's `children` in `app/routes.ts`, add the nav entry in `app/nav.ts`, the copy in `en.json`, and
a spec beside each file.
<!-- @noserver-end -->
<!-- @server-start -->
The data flows one way: **page -> store -> facade -> generated SDK**. A page reads a store and never
a service; the generated runtime is imported only in `services/` and `http.provider.ts`. A noun
`post`, step by step; the names the contract generates (`getApiPost`, `patchApiPostById`, `Post`)
exist once step 1 has run.

1. **Glossary and contract.** Name the noun and the action in `.doc/glossary.md`. If the server's
   contract changed, run `bun run api:types` (the input is the server's `openapi.json`):
   `src/services/generated/` is regenerated and committed, never edited. The committed copy of
   the template comes from `server/python-fastapi`; a rule the contract states differs per
   server (the e-mail pattern exists in python-fastapi's, not in bun-express's), and a project
   regenerates the folder from its own server at bootstrap.
2. **Models and service.** `models/post/type.ts` re-exports the generated types (`import type`;
   a hand-written API shape is a lint error). `services/post.service.ts` is an object with one
   method per call, each `throwOnError: true` returning `data`; a failure rejects with the
   `ApiError` the error interceptor built.

   ```ts
   // models/post/type.ts
   import type { Post } from '@/services/generated/types.gen'

   export type { Post }

   // services/post.service.ts
   import type { Post } from '@/models/post/type'

   import { getApiPost, patchApiPostById } from './generated/sdk.gen'

   export const postService = {
     async list(): Promise<Post[]> {
       const { data } = await getApiPost({ throwOnError: true })
       return data
     },

     async rename(id: string, title: string): Promise<Post> {
       const { data } = await patchApiPostById({
         path: { id },
         body: { title },
         throwOnError: true,
       })
       return data
     },
   }
   ```

3. **A read** is a setup store: `useRequestStatus()` gives `status`, `error`, `loading`, `loaded`,
   `failed` and the setters; a method sets loading, awaits the facade, patches the refs and, in the
   `catch`, toasts once. `fail` keeps the `ApiError` in state and logs a cause that is not an
   `ApiError`, so a bug is never silent. A store with two independent requests calls
   `useRequestStatus()` twice.

   ```ts
   // store/post.store.ts
   import { defineStore } from 'pinia'
   import { ref } from 'vue'

   import { errorMessageKey } from '@/core/config/error-copy'
   import type { Post } from '@/models/post/type'
   import { postService } from '@/services/post.service'

   import { useNotificationStore } from './notification.store'
   import { useRequestStatus } from './request-status'

   export const usePostStore = defineStore('post', () => {
     const request = useRequestStatus()
     const notifications = useNotificationStore()
     const posts = ref<Post[]>([])

     async function load(): Promise<void> {
       request.setLoading()
       try {
         posts.value = await postService.list()
         request.setLoaded()
       } catch (cause) {
         notifications.showError(errorMessageKey(request.fail(cause, 'post.load').code))
       }
     }

     return { ...request, posts, load }
   })
   ```

4. **A mutation** is a store method too. It checks `network.online` first and toasts
   `errors.offline` instead of sending, and answers whether the server accepted the change. A
   validation failure stays in `error` for the page to put on its fields (the form recipe below).

   ```ts
   // in store/post.store.ts, beside load(); also `import { useNetworkStore } from './network.store'`
   const network = useNetworkStore()

   async function rename(id: string, title: string): Promise<boolean> {
     if (!network.online) {
       notifications.showError('errors.offline')
       return false
     }
     request.setLoading()
     try {
       const saved = await postService.rename(id, title)
       posts.value = posts.value.map((post) => (post.id === id ? saved : post))
       request.setLoaded()
       return true
     } catch (cause) {
       notifications.showError(errorMessageKey(request.fail(cause, 'post.rename').code))
       return false
     }
   }
   ```
<!-- @server-end -->

<!-- @server:auth-start -->

**Account data.** A store that holds an account's data (`user.store.ts` is the example) exposes
`reset()` and clears itself when `auth.isLoggedIn` turns false, so sign-out and a refused refresh
leave nothing for the next account. Its `load()` drops the old value before it calls, and ignores
an answer that arrives after sign-out.

<!-- @server:auth-end -->

<!-- @server-start -->
5. **A page** `pages/post/`: `post.routes.ts` (a default export, a lazy component and `meta:
{ titleKey }`) and `post-page/post-page.vue` with its `post-page.scss`. The page wraps its root in
   `PageContainer`, reads the store with `storeToRefs`, shows a skeleton while loading and
   `ErrorState` with a retry on failure. A full-bleed screen (a board, an editor) leaves
   `PageContainer` out.

   ```ts
   // pages/post/post.routes.ts
   import type { RouteRecordRaw } from 'vue-router'

   const routes: RouteRecordRaw[] = [
     { path: 'post', component: () => import('./post-page/post-page.vue'), meta: { titleKey: 'post.title' } },
   ]
   export default routes
   ```

   ```vue
   <!-- pages/post/post-page/post-page.vue -->
   <script setup lang="ts">
   import { storeToRefs } from 'pinia'

   import { errorMessageKey } from '@/core/config/error-copy'
   import BaseSkeleton from '@/shared/components/base-skeleton/base-skeleton.vue'
   import ErrorState from '@/shared/components/error-state/error-state.vue'
   import PageContainer from '@/shared/components/page-container/page-container.vue'
   import PageHeader from '@/shared/components/page-header/page-header.vue'
   import { usePostStore } from '@/store/post.store'

   const store = usePostStore()
   const { posts, loading, failed, error } = storeToRefs(store)
   void store.load()
   </script>

   <template>
     <PageContainer>
       <section class="post">
         <PageHeader :heading="$t('post.title')" />
         <ErrorState
           v-if="failed"
           :description="$t(errorMessageKey(error?.code ?? 'unknown'))"
           @retry="store.load()"
         />
         <BaseSkeleton v-else-if="loading" :lines="3" />
         <ul v-else>
           <li v-for="post in posts" :key="post.id">{{ post.title }}</li>
         </ul>
       </section>
     </PageContainer>
   </template>

   <style lang="scss" src="./post-page.scss"></style>
   ```

6. **Route and nav.** Spread the routes file into the main layout's `children` in `app/routes.ts`
   (`...postRoutes`), and for a top-level screen add `{ path: '/post', labelKey: 'nav.post' }` to
   `app/nav.ts`.
7. **Copy** in `core/i18n/translations/en.json`: `post.title`, `nav.post` and the `errors.<code>`
   text for any new envelope code (the rules are under Styling, Copy).
8. **Specs** beside each file (see Tests): service, store, page.
<!-- @server-end -->

**The shell.** The template renders no header, navigation or footer: `layout/app-main-layout/app-main-layout.vue`
is the skip link, the page's one `main` and the toast host. A product's chrome is an `app-*`
component in `layout/` (this template's home for app-wide components) that the layout renders
between the skip link and `<main>`. `layout/` may not import `app/`, so a navigation takes the
table of `app/nav.ts` as a prop that `routes.ts` passes (`props: { nav: NAV }`). `app-theme-toggle` is
ready to place there.

<!-- @server:auth-start -->

With the server's auth, `app-account-menu` is ready to place there too: avatar, email, profile and
sign out, and no theme control.

<!-- @server:auth-end -->
<!-- @i18n-start -->

With `i18n`, so is `app-language-toggle`.

<!-- @i18n-end -->
<!-- @pwa-start -->

With `pwa`, so is `app-install-button`.

<!-- @pwa-end -->

`main` has no width and no padding: a page gets its container from `PageContainer`
(`shared/components/page-container/page-container.vue`), and a full-bleed page leaves it out.

<!-- @server-start -->
**Guarding a route (the server's `auth` flag; the files exist only then).** `core/guards/` holds
`authGuard` (a visitor is redirected to `/auth/login?next=<attempted path and query>`),
`guestGuard` (login and signup: an account goes home) and `roleGuard`. They are
`beforeEnter` guards on the route in the module's `*.routes.ts`: `{ path: '', beforeEnter:
authGuard, component: ... }`, and for a role `{ beforeEnter: roleGuard, meta: { roles: ['admin']
}, ... }` (a visitor goes to login, another role to `/forbidden`). Each awaits `authStore.ready`
before it decides. A guard only keeps a visitor off a screen; the API decides on every call. In a
template, `v-has-role="'admin'"` (or an array) hides a control from an account without the role:
`shared/directives/has-role.ts` is built per app by `createHasRoleDirective(roles)` and registered
in `app/plugins.ts`, which also provides `ROLES_KEY` (`shared/directives/roles.ts`) from the same
ref, so a navigation a product builds can filter by `NavEntry.roles` through it. A page with edits to lose calls
`useUnsavedChangesGuard(hasChanges)` (`core/guards/unsaved-changes.guard.ts`; `hasChanges` is a
function answering whether there are edits) and binds the returned state to a `<ConfirmDialog>`
(`profile-page.vue` is the example). The login page reads `next` through `safeNextPath`
(`shared/utils/next-path.ts`): only a path on this site is followed, anything else is `/`.

**The session hint.** The session is two HttpOnly cookies; JavaScript never holds a token. The
hint (`STORAGE_KEYS.sessionHint`, the value `'1'`, through `core/providers/session.ts`) means "this
browser signed in". With the hint, start-up reads `GET /api/user/me`
(`core/initializers/session.initializer.ts` starts `authStore.restoreSession()`, never awaited by
the mount) and a 401 may trigger a refresh; without it a visitor's page load calls neither. A
login or signup sets it, a sign-out or a refused refresh clears it, and a network error or an
outage keeps it. Never store anything else under it, and never branch on it outside the auth
store, the session initializer and the auth interceptor. The restore is capped at 5 s
(`SESSION_RESTORE_TIMEOUT_MS`): after the cap the app is a visitor for good, a late answer is
discarded, and a guarded deep link lands on sign-in with `next`.
<!-- @server-end -->

<!-- @server-start -->
**The form recipe, by example.** `pages/auth/auth.form.ts` is the pattern: one function per form
(`loginForm()`, `signupForm()` with `match('password', 'confirm')` as its rule, `otpForm()`),
each `useSchemaForm(schema, initial, rules?)` (`shared/validators/schema-form.ts`) over the generated
request schema (`zCredentials`, `pick(zOtpVerificationBody, ['code'])`), so no limit is
copied. The file's first import is `@/shared/utils/validation` (see below). `useSchemaForm`
returns `values` (the reactive object `v-model` binds), `error(name)`, `errorText(name)`
(translated, for a field's `error` prop), `touch(name)`, `submit(handler)`, `submitting`,
`submitted`, `valid`, `unmapped`, `serverErrors` and `reset()`; call it in `setup`, it reads the
installed i18n. An error shows once its field is touched (`@blur="form.touch('email')"`) or the
form was submitted, and the first issue per field wins. `submit` validates, calls the handler with
the parsed value (a field the schema lacks, such as `confirm`, is not in it) and ignores a second
call while it runs; an invalid form calls nothing. The page composes
`<form novalidate @submit.prevent="submit">`, one
`<FormField :label="$t('auth.email')" :error="form.errorText('email')">` around each control
(`<BaseInput v-model="form.values.email" type="email" autocomplete="email" />`) and
`<FormActions :pending="loading" />`. The field gives the control its id and `aria-invalid` /
`aria-describedby` through `FORM_FIELD_KEY`. Error text is `errors.<key>` in `en.json` (`required`,
`email`, `minlength`, `maxlength`, `min`, `max`, `pattern`, `invalid`, `match`; lengths fill
`{min}` and `{max}`). A field the contract names is never re-validated by hand, even when the
control needs a looser shape (`user.form.ts` widens the generated phone rule to accept `''`,
meaning "remove the number", and keeps the rule itself). A checkbox carries its own label: give its
field no `label`.
<!-- @server-end -->

**zod, its facade and the CSP.** `shared/utils/validation.ts` is the one file that imports `zod`: the
app builds and runs every schema through its functions (`text`, `number`, `flag`, `object`, `field`,
`pick`, `either`, `validate`, `isValid`, `parse`) and no file calls a method on a schema, the
generated ones included. zod 4 probes `new Function('')` when a schema is built, a violation of the
deployed `script-src 'self'`; the facade calls `z.config({ jitless: true })` as it loads. `main.ts`
imports it, and so must every module that imports `@/services/generated/zod.gen` at run time, as its
first import (the build splits shared code into chunks, so `main.ts` alone is not enough). A new
`*.form.ts` begins `import '@/shared/utils/validation'`; `tests/unit/validation-first.spec.ts` fails
the module that does not.

**External libraries sit behind a facade.** An external library is imported only by its facade, and
lint refuses it elsewhere: `zod` by `shared/utils/validation.ts`, `reka-ui` by `shared/components/`
(the kit), `lucide-vue-next` by `shared/components/icons.ts`; with `pwa`, the service worker
library (`virtual:pwa-register`, `workbox-window`) by `store/app-update.store.ts`. The framework and its
official ecosystem (`vue`, `vue-router`, `pinia`, `vue-i18n`) and the generated code are exempt.

## Styling

Two homes. The global tree in `src/styles/` is exactly `styles.scss`, `setup/`, `themes/` and
`basics/`, imported once from `main.ts`; every page and component carries a sibling stylesheet of
its own (`tests/unit/styles-tree.spec.ts`). `setup/` (variables, breakpoints, functions, mixins,
typography, `_layers.scss`; emits no CSS but the typography), `themes/` (`brand.css` holds the
generated brand tokens in plain CSS, `_light.scss` and `_dark.scss` the product's additions) and
`basics/` (helpers, base, layout). `styles.scss` `@use`s `setup/layers` first, then setup, themes and
basics, and the three groups sit in cascade layers (`@layer setup, themes, basics;`). Breakpoints
`sm` 576, `md` 768, `lg` 1024, `xl` 1280, `xxl` 1536, mobile first (`@include up(md)`); spacing on a
4 px base (`space()`, `z()`).

- **Rules for a component.** A page or component that needs rules gets a sibling `.scss` with its
  stem (`base-button.scss`, `home-page.scss`) and references it with an empty
  `<style lang="scss" src="./<stem>.scss"></style>` block, the last block of the file. `scoped` and a
  `<style>` body are refused, so is a `style` attribute (static or bound) and any stylesheet import
  outside `main.ts`. A partial two components share (`controls.scss`) is
  referenced by each of them. Sibling sheets are never layered: an unlayered rule beats a layered
  one at any specificity, so a page or component wins over the global tree whatever order the
  bundler links the chunks in. Class names are BEM (`.page-header__actions`); a sheet `@use`s
  `setup/...` (the `styles/` folder is a load path) for the functions and mixins it needs. Never
  write a whole-line `// @word` comment in SCSS: the generator reads it as a marker.
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
- **Icons.** One set: `shared/components/base-icon/base-icon.vue` over `lucide-vue-next` (the entries of
  `icons.ts`, the one file that imports it). One concept, one icon; a new concept adds an entry there, never a second set.
- **Toasts.** One implementation: `store/notification.store.ts` holds the list and
  `layout/app-toast-host/app-toast-host.vue` renders it through Reka Toast (`shared/components/base-toast/base-toast-host.vue`). A toast may carry one action
  (`{ labelKey, run }`; only `showInfo` and `showWarning` take it): it never times out and is
  dismissed when the action runs.
- **Motion.** `<Transition>` and `<TransitionGroup>` wrap only elements the component renders
  itself; Reka's toasts, which it portals into its
  viewport, animate through their own `data-state`. Every transition class sits in the owner's
  sheet with a `@media (prefers-reduced-motion: reduce)` rule that switches it off.
- **Theme toggle.** One toggle for everyone, `layout/app-theme-toggle/app-theme-toggle.vue`: a ghost icon button
  that cycles light, dark and system, which the product places (see The shell).
- **Copy.** Every user-visible string goes through `$t('notFound.title')` in a template or `t` from
  `useI18n()` in script, with its key in `core/i18n/translations/en.json`, nested by area, `{param}`
  for values, and the same key in `he.json` when the `i18n` flag is on. vue-i18n is installed in
  both modes, so nothing branches on the flag.
- **Flag off (`i18n`).** The language toggle, `he.json`, `languages.ts`, the language store and
  initializer and the RTL spec are gone; the English table stays bundled and every `t` call site
  is unchanged.
- **Width.** A form lives in a view no wider than `40rem` (`home-page.scss`); do not stretch a form
  field across the container.
- **Text props and labels.** A component prop that carries text takes an already translated string,
  and the heading prop of `PageHeader`, `EmptyState` and `ErrorState` is `heading`, never `title`.
  A `BaseButton` with `size="icon"` needs an `aria-label`; dev mode logs a console error when it
  is missing. A prop named `...Key` (`submitKey`, `cancelKey`, `emptyKey`, `captionKey`) takes a
  key of the copy table and translates it itself.
- **Raw controls** (`<button>`, `<input>`, `<select>`, `<textarea>`) exist only under
  `shared/components/`; a page never writes one. `BaseButton` also renders a router link (`to="/"`)
  so navigation and actions look the same.

**The components** (`shared/components/<name>/<name>.vue`, the form ones in `components/form/`; the rubric names of the `ui-design` skill):

| Component                                                     | What it is                                                                                                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base-button` (`BaseButton`)                                  | The one `<button>` (or a link with `to`); `variant`, `size`, `loading`, `aria-label` for `size="icon"`.                                                                           |
| `base-icon`                                                   | The one icon set; `name`, `large`.                                                                                                                                                |
| `form-field` (`FormField`)                                    | Label, hint, the default-slot control and its error (below).                                                                                                                      |
| `base-input`, `base-select`, `base-textarea`, `base-checkbox` | The controls; each takes `v-model` and emits `blur`. `base-input` has `type` and a password toggle; `base-select` and `base-checkbox` are Reka primitives.                        |
| `form-actions` (`FormActions`)                                | Submit (`pending` shows the spinner and disables; `submitKey`) and optional cancel (`cancellable`, `@cancelled`); stacked on phones.                                              |
| `page-header` (`PageHeader`)                                  | Page heading, description and an `actions` slot.                                                                                                                                  |
| `data-table` (`DataTable`)                                    | `columns`, `rows`, a `cell` slot, `captionKey`, an empty state; scrolls inside its container.                                                                                     |
| `base-modal`, `confirm-dialog`                                | `BaseModal` (`title`, `size`, `v-model:open`) is the dialog; `ConfirmDialog` (`title`, `message`, `danger`, `@confirm`, `@cancel`) is the confirm pattern; both over Reka Dialog. |
| `base-toast`                                                  | One toast, presentational; the list is rendered by `layout/app-toast-host/app-toast-host.vue`.                                                                                               |
| `empty-state`, `error-state`                                  | What a list shows with nothing to show, and what a failed load shows (`heading`, `description`, `@retry`).                                                                        |
| `base-skeleton`, `base-spinner`                               | Loading placeholders; the spinner is a status region unless `decorative`.                                                                                                         |
| `page-container` (`PageContainer`)                            | The page pattern's frame: the container width, centring, gutters and the compact padding. A page wraps its root in it; a full-bleed page leaves it out.                           |
| `Page` (rubric)                                               | The route's page `.vue` inside `<main id="main">`: a `PageContainer` around its root `<section>`, with its sibling `<name>-page.scss` setting the width and spacing.              |
| `Section` (rubric)                                            | No component: a `<section>` with its own heading in the page, styled by the page's sibling sheet.                                                                                 |
| `ListSkeleton`, `CardSkeleton` (rubric)                       | `BaseSkeleton`: `:lines="n"` for a list of rows, `variant="block"` for a card.                                                                                                    |

<!-- @server:auth-start -->

With the server's `auth` flag, `shared/components/auth-card/auth-card.vue` (`AuthCard`) is the sign-in and
sign-up card, 26rem wide: props `heading` (required) and `description`, the default slot for the
form and a `footer` slot for the alternate link. The file exists only with `auth`.

<!-- @server:auth-end -->

Beside them: `shared/directives/autofocus.ts` (`v-autofocus`: focuses the element, or the first
control inside it, once after mount), `shared/composables/` (`use-media-query.ts`,
`use-unique-id.ts`: pure Vue, no store) and `shared/utils/` (Vue has no pipes, so they are
functions: `relativeTime(iso, lang)` "3 minutes ago" in the active language, `formatPhone(e164)` a
grouped display with anything else unchanged, and the pure `time.ts`: `parseTime`, `differenceIn`,
`isSameDay`).

## Errors

<!-- @server-start -->
The error interceptor maps a failed call to an `ApiError` and nothing else; the store method that
awaited the call shows the outcome.

- **`ApiError`** (`models/api/type.ts`, a plain object so it can sit in state): `code`,
  `status?`, `requestId?` (the envelope's, else the `x-request-id` header), `fieldErrors?` (path ->
  codes, from a validation envelope's `details`) and `context?` (where a cause that was no
  `ApiError` came from; logged, never shown). `isApiError()` (`services/api-error.ts`) is the guard. The server's `message`
  and `details` text are never kept or shown.
- **Codes.** The envelope's: `validation_failed`, `unauthenticated`, `forbidden`, `not_found`,
  `conflict`, `payload_too_large`, `unsupported_media_type`, `rate_limited`, `internal`,
  `upstream_unavailable`. Ours: `network` (no response), `unknown` (not the envelope, or a code the
  table lacks), `validation` (a client check that failed before any request).
- **Copy table.** Each code has `errors.<code>` in `en.json`, plus `errors.offline` and
  `errors.unexpected`. `errorMessageKey(code)` returns the key, `errors.unknown` for anything else;
  a code added to the contract fails the build in `core/config/error-copy.ts` until it is listed, and
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
  an exempt call (`/api/auth/login`, `signup`, `refresh`, `otp`, `otp/verification`: they answer
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
  toasts `validation_failed`, and `signup` passes `{ conflict: null }`. On a `validation_failed`
  the page calls `applyFieldErrors(form, error)` (`shared/validators/server-errors.ts`): each path
  in `fieldErrors` that names a field gets `errors.invalid` and shows in its field; the unmapped
  paths come back and the page toasts `errors.validation_failed` once for them (none: nothing). A
  taken email (`conflict`) lands on the email field with `auth.signup.conflict`
  (`form.serverErrors.email = { messageKey: 'auth.signup.conflict' }` and `form.touch('email')`).
  A field error is never also a toast, and any other code toasts its own copy.
<!-- @server-end -->
<!-- @noserver-start -->
No server, so no API errors yet: the `ApiError` mapping, the interceptors and the field errors arrive
with one (`scripts/scaffold.mjs`).
<!-- @noserver-end -->
- **Toasts.** `useNotificationStore().showError('errors.unexpected')`, a key of the copy table,
  fires from the handler that awaited the work, never from an interceptor or a watcher.
<!-- @server-start -->
- **Failure state.** A page whose load failed shows `<ErrorState>` with the mapped description and
  a retry that calls the store method again.
<!-- @server-end -->
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
<!-- @server-start -->
- **The API is the one boundary a test fakes.** `stubApi({ 'GET /api/post': Response.json([...]) })`
  (`src/testing/stub-api.ts`) replaces the global `fetch`, keyed `METHOD /path`; unlisted calls
  answer 404. A facade is tested through it, with the real generated client behind.
- **A store** is tested on a fresh `createPinia()` with either `stubApi` (the real facade and
  client behind it, as `auth.store.spec.ts`) or `vi.spyOn` on one facade method (as a store spec of
  the recipe), never a module mock of a facade (the one `vi.mock` in a store spec
  replaces the virtual `virtual:pwa-register/vue` module, in `app-update.store.spec.ts`); **a
  page** with
  `renderWithApp(Page, { route, initialState })` (`src/testing/render.ts`): a testing Pinia
  (`stubActions: false`), a memory-history router over the real route table and the English copy in
  memory, so assertions read the same with the `i18n` flag on or off. Query by role and name, as a
  user would.
<!-- @server-end -->
<!-- @noserver-start -->
- **A page** is tested with `renderWithApp(Page, { route, initialState })` (`src/testing/render.ts`): a
  testing Pinia (`stubActions: false`), a memory-history router over the real route table and the
  English copy in memory, so assertions read the same with the `i18n` flag on or off. Query by role
  and name, as a user would.
<!-- @noserver-end -->
- `src/testing/` is imported only by `*.spec.ts`; `auth-fixtures.ts` (auth only) holds the account
  fixtures.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`) and run with
  `bun run test:e2e`. Install the browser once with `bunx playwright install chromium` (add
  `--with-deps` on Linux).
<!-- @server-start -->
- **Two modes.** By default `playwright.config.ts` starts the API fresh (`reuseExistingServer:
false`, `RATE_LIMIT_SCALE=100`) and then `bun run build && bun run preview`: the production
  bundle behind `vite preview`, which forwards `/api` to the API, so the page and the API share one
  origin as in the image. With `E2E_BASE_URL` set (a blank value counts as unset) it tests that
  URL and starts nothing; the catalog's case runner does this against the Compose stack. The API
  there runs at rate-limit scale 1 with one per-address bucket, so the suite can run about once per
  15 minutes per stack, and it leaves its accounts in that stack's database.
<!-- @server-end -->
<!-- @noserver-start -->
- **Two modes.** By default `playwright.config.ts` builds the app and serves it with
  `bun run build && bun run preview`: the production bundle. With `E2E_BASE_URL` set (a blank value
  counts as unset) it tests that URL and starts nothing.
<!-- @noserver-end -->
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
- **Specs.** `shell.spec.ts` asserts the skip link, the one `main`, no horizontal overflow, the 404
  inside `main`, its control's 44 px touch target (phone, also with `data-density="compact"`), the
  desktop densities, the compact padding of the page container, a clean console, the theme script
  served as a file and the bundle under a CSP that forbids eval.
<!-- @noserver-start -->
  `smoke.spec.ts` asserts the index route is one `h1` inside `main` and passes the axe scan.
  `screens.spec.ts` captures every screen
<!-- @noserver-end -->
<!-- @server-start -->
  `smoke.spec.ts` asserts the index route is one `h1` inside `main` and that `GET /api/health` on
  the page's origin answers 200 (the proxy, by a request). `screens.spec.ts` captures every screen
<!-- @server-end -->
  in phone and desktop, light and dark, to `test-results/screens/<route>-<viewport>-<theme>.png`
  (QA reads them) and checks each: no axe violation of the WCAG A and AA tags (in dark this is the
  contrast measurement), no horizontal scroll, exactly one `h1`. A failure names the route, theme
  and project with the rule ids and targets.

<!-- @i18n-start -->

- **RTL.** With `i18n`, `shell.spec.ts` stores the Hebrew choice before the page loads and asserts
  `dir="rtl"`, no horizontal overflow and no axe violation: the toggle is on no page of the
  template, so the check starts from the stored choice.

<!-- @i18n-end -->

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
  `signupThroughApi`, which signs up through the API (the cookies land in the browser context)
  and plants the session hint (`localStorage` key `session-hint`, the JSON string `"1"`). Entries
  share one account per project because the sign-up route is rate limited. `auth.spec.ts` covers
  sign-up, sign-in, the profile, sign-out, a wrong password, a taken email on its field, the
  guarded redirect with `next`.
  An e2e that forces a theme writes the JSON-quoted value (`setTheme`).

<!-- @server:auth-end -->

- **The scans.** `tests/unit/styles-tree.spec.ts` reads the whole tree: `src/styles/` holds exactly
  `styles.scss`, `setup/`, `themes/` and `basics/`; every `.scss` outside it has a sibling `.vue` with
  its stem whose `<style lang="scss" src>` block is empty and last (or is referenced by two or more
  siblings); no `scoped`, no block with a body, no `style` attribute; a `.vue` in
  `layout/` starts with `app-` and none in `shared/components/` does; the global partials sit in
  their `@layer` and no sibling sheet does. `density.spec.ts` and `rtl-styles.spec.ts` compile and
  scan `styles.scss` plus every sheet outside `styles/`. Each rule has a seeded case in the scan.
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

<!-- @noserver-start -->
- `bun run dev` serves the app (Vite) on the template's port.
- `bun run build` writes `dist/` with `index.html` and the content-hashed files under `assets/`.
<!-- @noserver-end -->
<!-- @server-start -->
- `bun run dev` serves the app (Vite) on the template's port and proxies `/api` to the server's
  port (`vite.config.ts`).
- `bun run build` writes `dist/` with `index.html` and the content-hashed files under `assets/`.
  The app calls the API at relative `/api`, so whatever serves `dist/` also routes `/api` to the
  server.
<!-- @server-end -->
<!-- @server-start -->
- **Service worker (the `pwa` flag).** `vite-plugin-pwa` (`registerType: 'prompt'`) emits the
  manifest, `sw.js`, `registerSW.js` and `workbox-*.js` into `dist/`; the worker registers in
  production only. It precaches the shell, never answers an `/api/` navigation with it, and caches
  no API response. A page module adds a URL to `runtimeCaching` in `vite.config.ts` only for a public
  read that carries no session or personal data; never `/api/**`.
<!-- @server-end -->
<!-- @noserver-start -->
- **Service worker (the `pwa` flag).** `vite-plugin-pwa` (`registerType: 'prompt'`) emits the
  manifest, `sw.js`, `registerSW.js` and `workbox-*.js` into `dist/`; the worker registers in
  production only. It precaches the shell. A page module adds a URL to `runtimeCaching` in `vite.config.ts`
  only for a public read that carries no session or personal data.
<!-- @noserver-end -->
- **How an update reaches the user.** `store/app-update.store.ts` holds `needRefresh` and
  `updateServiceWorker`; `core/initializers/pwa.initializer.ts` checks at start, hourly and on
  window focus. When a version is ready, an info toast offers `pwa.reload`; the action activates it
  and reloads the page. Serve `sw.js`, `registerSW.js`, `workbox-*.js`, the manifest and
  `index.html` with `Cache-Control: no-cache` (`nginx/default.conf` does).
- **Install.** The manifest is configuration in `vite.config.ts` (its theme and background colours
  are `#ffffff`; change them to the brand) and the placeholder icons are in `public/icons/`
  (`icon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`).
  **Replace the icons** with the product's own. `app-install-button` is the button the product
  places when the browser offers one; iOS Safari gets a hint toast (no install event there).
- **Flag off.** Without `pwa` the plugin lines, `vite-plugin-pwa` and `workbox-window`, the icons,
  the stores, the initializer and `app-install-button` are gone, and the build emits no worker.
<!-- @server-start -->
- The app calls the API at relative `/api` on its own origin in every environment: no API URL is
  compiled into the bundle and there is no CORS. Whatever serves `dist/` must also route `/api` to
  the server (a reverse proxy, or the server serving the files itself).
<!-- @server-end -->
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
- Deployed alone, the image's `serve` target is nginx on the template's port; there is no Compose file
  and no deploy mode.
<!-- @noserver-end -->
- **`Dockerfile` targets.** `build` is `oven/bun:1.4-alpine`: a frozen install and
  `bun run build`. `dist` is `FROM scratch` and holds only the built files at `/dist`: the
  server's image copies it. `serve`, the last and so the default target, is
  `nginxinc/nginx-unprivileged:1.31.7-alpine` with the files at `/usr/share/nginx/html`; it runs as
  uid 101, listens on `PORT` and has a `wget` healthcheck. `.dockerignore` keeps environment files,
  tests and source maps out of every image.
<!-- @server-start -->
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
<!-- @server-end -->
<!-- @noserver-start -->
- **nginx files**, in `nginx/`. `default.conf` is the config template (copied to
  `/etc/nginx/templates/default.conf.template`; the entrypoint renders it with `envsubst` over
  `PORT`). Cache policy per file class: `/assets/*` is `immutable` for a year;
  `index.html`, the worker files (`pwa`) and any other file are `no-cache`; an extension-less path
  is `index.html`; a missing file with an extension, a dotfile and a bare `/assets/` are 404 (never
  a listing); a path above the root is nginx's own 400. Keep three rules when editing: no `add_header` at
  server level (a location with its own drops the inherited ones), no dollar sign in a comment
  (`envsubst` rewrites it), and no environment variable named like an nginx variable (`host`,
  `uri`).
<!-- @noserver-end -->
- **Content Security Policy.** `security-headers.conf` holds the headers of helmet 8.3.0 and is
  included by each static location. `script-src 'self'` (no inline script: `theme-init.js` is a
  file, and zod runs in `jitless` mode, see Adding a feature). With `pwa` the policy also carries
  `worker-src 'self'` and `manifest-src 'self'` (the `# @pwa` lines). A project that loads a font,
  an image or an API from another origin widens the matching directive there, and nowhere else.
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
<!-- @server-end -->
<!-- @noserver-start -->
- **What a project changes.** The brand colours and icons of the manifest and the CSP directives for
  any origin it adds.
<!-- @noserver-end -->
