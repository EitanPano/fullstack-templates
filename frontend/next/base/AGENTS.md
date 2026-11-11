The layer map of this package. Commands are in `package.json`; the contract code in `src/services/generated/` is generated, never edited. <!-- @server -->
The layer map of this package. Commands are in `package.json`. <!-- @noserver -->

**`src/`**

- `app/`: the pages layer: route files and each route's own pieces; no fetch, no business logic.
  The root `layout.tsx` (document, `ThemeProvider`, `Toaster`) and `global-error.tsx` (its own
  document) load the global style tree; `not-found.tsx`; `nav.ts` (`NAV`, the one navigation table).
  `(site)/`: `layout.tsx` (the skip link and the one `main`), `page.tsx` (the index route, one
  `h1`), `loading.tsx`, `error.tsx`, `not-found.tsx`, `[...slug]/page.tsx` (a catch-all that keeps a
  404 inside `main`). A route's sheet is `page.scss` beside it. A route's own pieces are in
  `<route>/_components/` (Next never routes a `_` folder), imported by the route folder that holds
  it and the routes below it; a piece unrelated routes share moves to `layout/app-<name>`.
<!-- @server:auth-start -->
- `(auth)/`: `sign-in/` and `sign-up/` (a `page.tsx` and `_components/` each), a `layout.tsx` with a
  centred `main` that sends a signed-in account home (`_components/guest-only/`), `loading.tsx`
  and `error.tsx`. `(site)/profile/` is the guarded-page example; `(site)/forbidden/` is where
  `requireRole` sends a wrong role. `proxy.ts` (in `src/`) keeps the session fresh.
<!-- @server:auth-end -->
- `layout/`: app chrome, every component `app-*`. `app-user-menu` (the avatar menu, with the theme
  items) is the control a product places; `app-theme-menu` is those items alone. A component goes
  here when a layout or more than one route renders it; a reusable control or pattern goes to
  `shared/components/`.
<!-- @server:auth-start -->
- `layout/app-account-menu` (async: it reads the session, so it sits in `Suspense` with
  `app-account-menu-skeleton`), `app-sign-out-item`, `app-auth-loading` (the auth screens' loading shape).
<!-- @server:auth-end -->
- `services/`: facades of libraries with I/O, and the data layer: every API call of an entity is a function of `services/<noun>.ts`, the only importer of the generated client's functions. <!-- @server -->
  `client.ts` (`createApi`, `createRequestApi`), `call.ts` (`call`, `DEFAULT_COPY`), <!-- @server -->
  `generated/` (Hey API output: types, SDK, fetch client, zod; committed, lint-ignored). <!-- @server -->
- `services/`: facades of libraries with I/O, and the data layer: reads per entity. Empty until a server arrives (see Adding a feature). <!-- @noserver -->
<!-- @server:auth-start -->
- `services/auth.ts` (`login`, `signup`, `logout`, `refresh`), `services/user.ts` (`getMe`, one
  `GET /api/user/me` per request for the session and the page; `getProfile`, the profile page's read).
<!-- @server:auth-end -->
- `actions/`: per glossary noun, `<noun>.ts` (Server Actions, `'use server'`, one export per action),
  `<noun>.form.ts` (a form's zod schema, shared by the action and the client form) and
  `<noun>.copy.ts` (the outcome copy).
<!-- @server:auth-start -->
- `actions/auth.ts` (`signIn`, `signUp`, `signOut`), `auth.form.ts`, `auth.copy.ts`.
<!-- @server:auth-end -->
- `store/`: a named layer that ships no file: client-only state two or more routes read (a
  `'use client'` provider and its hook). The theme is `next-themes`'; create the folder with the first.
- `models/`: one folder per glossary noun holding only `interface.ts`, `type.ts`, `enum.ts` and
  `constant.ts`, each when needed (`models/nav/interface.ts`: `NavEntry`); no schema, copy, helper
  or test. The contract's types are re-exported from `models/<noun>/type.ts`.
<!-- @server:auth-start -->
- `models/user/type.ts` (`User`), `models/auth/type.ts` (`AuthTokens`).
<!-- @server:auth-end -->
- `shared/`: product-agnostic; imports `shared/` and `models/` only. `components/`: a component of
  two or more files is a folder named for it (`button/button.{tsx,scss,test.tsx}`, imported as
  `@/shared/components/button/button`), a one-file component stays a file: primitives (`button`,
  `badge`, `card`, `dialog`, `sheet`, `dropdown-menu`, `tooltip`, `tabs`, `toaster`, …) and patterns
  (`page`, `empty-state`, `error-state`, `skeletons`, `confirm-dialog`).
  `components/form/`: `form`, `field-frame`, `use-field`, `action-form`, the `*-field` bindings
  (`text`, `textarea`, `number`, `select`, `checkbox`, `password`, `date-time`) and the form
  controls (`input`, `textarea`, `checkbox`, `radio-group`, `select`, `switch`, `label`, `form-actions`). Only `confirm-dialog`, `error-state`, `toaster` and the `form/` bindings are
  Client Components. `utils/`: `cn`, `date`, `initials`,
  `zod-messages` (zod's global messages, imported first by every file that builds a schema).
<!-- @server:auth-start -->
- `shared/components/auth-card/auth-card.tsx` (`AuthCard`).
<!-- @server:auth-end -->
- `core/`: glue below the pages; `shared/` never imports it. `actions/`: `safe-action.ts` (`action`)
  and `action-error.ts` (`ActionError`). `config/env.ts`: the only reader of `process.env`,
  zod-parsed; browser-visible values are `NEXT_PUBLIC_*`.
<!-- @server:auth-start -->
- `core/auth/`: `session.ts` (with `getCurrentUser`), `cookies.ts`, `refresh.ts`, `token.ts`, `next-path.ts` (a `'use client'`
  file imports no value from it); `core/actions/safe-action.ts` also holds `accountAction`, `roleAction`.
<!-- @server:auth-end -->
- `styles/`: global and app-wide CSS only: `styles.scss`, `setup/`, `themes/`, `basics/` (see Styling).

**Where does X go**

| Addition                                                  | Home                                                 |
| --------------------------------------------------------- | ---------------------------------------------------- |
| A contract type, an interface, an enum, a constant        | `models/<noun>/{type,interface,enum,constant}.ts`    |
| A form's zod schema, its outcome copy                     | `actions/<noun>.form.ts`, `actions/<noun>.copy.ts`   |
| A read from the API                                       | `services/<noun>.ts`                                 | <!-- @server -->
| A read of the product's data                              | `services/<noun>.ts`                                 | <!-- @noserver -->
| A mutation                                                | `actions/<noun>.ts`                                  |
| A route, its layout, loading and error                    | `app/(group)/…`, its sheet beside it                 |
| A section of one route, or the form that runs a mutation  | `app/<route>/_components/<name>/<name>.tsx` + `.scss`|
| A component a layout or several routes use                | `layout/app-<name>/app-<name>.tsx` + `.scss`         |
| State shared across routes (client-only)                  | `store/`                                             |
| A primitive (button, dialog), a pattern, a form control   | `shared/components/<name>/<name>.tsx` + `.scss`, `form/` |
| A pure helper, a date or formatting facade                | `shared/utils/`                                      |
| A navigation entry                                        | `app/nav.ts`                                         |

**Import rules** (`eslint-plugin-boundaries`; each lint message names the layer to use instead):

| From                                 | May import                                                         |
| ------------------------------------ | ------------------------------------------------------------------ |
| `app/` (route files, `_components/`) | layout, services, actions, store, core, shared, models             |
| `layout/`                            | services, actions, store, core, shared, models; never `app/`       |
| `actions/`                           | services, core, shared, models; generated types and `zod.gen`      |
| `services/`                          | `services/generated`, core, models                                 | <!-- @server -->
| `services/`                          | core, models                                                       | <!-- @noserver -->
| `store/`                             | core, shared, models                                               |
| `core/`                              | services, shared, models, core                                     |
| `shared/`                            | shared, models                                                     |
| `models/`                            | models; the generated types (`import type`)                        | <!-- @server -->
| `models/`                            | models                                                             | <!-- @noserver -->

Also lint-enforced:

- Only `app/` imports `app/`; a `_components/` file only from the folder that holds it and the folders below it.
- A `'use client'` file imports no value from `services/` (types are fine): it calls a Server Action
  from `actions/` or receives the data as props.
<!-- @server-start -->
- The generated client's functions are imported only by `services/`: an action or `core/` calls
  `services/<noun>.ts`, and takes from the generated files only types and `zod.gen` schemas
  (`models/` only types); everything else reads the contract's types through `models/<noun>/type.ts`.
<!-- @server-end -->
- `button`, `input`, `select` and `textarea` JSX elements only in `shared/components/`; `interface`
  only in `models/*/interface.ts`, `type` everywhere else.
  `revalidatePath` and a bare `fetch(` only in `services/`. `process.env` only in `core/config/env.ts`.
- The `style` JSX attribute nowhere; a stylesheet import is only the owner's sibling
  `./<stem>.scss`; only `app/layout.tsx` and `app/global-error.tsx` load the global tree.
- `boundaries/no-unknown-files` is on: a file in a directory no layer claims (`src/lib/`,
  `src/hooks/`) is an error; `src/styles/**` and the tests are exempt.

`tests/unit/eslint-boundaries.test.ts` lints one violation and one allowed case per rule, in a
throwaway project built from the real `eslint.config.mjs`. A new rule gets a case there. Use the
`@/` alias for every import that crosses a directory; relative imports stay inside one directory.
Server Components are the default; `'use client'` goes only on leaf components that need state,
effects or browser APIs, and they get data through props or a Server Action, never `fetch`.

## Adding a feature
<!-- @noserver-start -->

This package has no server. What arrives with one is added by the harness (`scripts/scaffold.mjs`; never copy it by hand): the typed client generated from its contract (`src/services/generated/`, `openapi-ts.config.ts`, the `api:types` script, `@hey-api/openapi-ts`), `createApi` and `call` with the error-envelope copy (`src/services/client.ts`, `src/services/call.ts`) and their tests, the API address in `src/core/config/env.ts` and `.env.example`, and the API web server in the e2e config.
<!-- @noserver-end -->

1. Name the noun and the action in `.doc/glossary.md`. The noun gets `models/post/` and
   `services/post.ts`, the action an export of `actions/post.ts`, the page `app/(site)/post/`.
<!-- @server-start -->
2. If the server's contract changed, run `bun run api:types`: `src/services/generated/` is
   regenerated and committed, never edited.
<!-- @server-end -->
2. There is no server yet, so no typed client: keep data in the browser or in Next's own server code. <!-- @noserver -->
<!-- @server-start -->
In the blocks, `getApiPost`, `patchApiPostById`, `listPosts`, `updatePost`, `Post`, `PostRow`,
`PostListSkeleton`, `renamePost`, `renamePostSchema` and `RENAME_POST_COPY` are the example feature's own names;
everything else in them already exists in the template.
<!-- @server-end -->
   In the blocks, `listPosts`, `PostRow`, `PostListSkeleton` and `renamePost` are the example feature's own names; everything else in them already exists in the template. <!-- @noserver -->

<!-- @server-start -->
3. The model, `models/post/type.ts`: the contract's types re-exported; the form schema is
   `actions/post.form.ts` (it extends the generated request schema, after
   `@/shared/utils/zod-messages`) and the copy table `actions/post.copy.ts`.
<!-- @server-end -->
3. The model, `models/post/type.ts`: the types; the form schema `actions/post.form.ts` (it imports `@/shared/utils/zod-messages` first), the copy `actions/post.copy.ts`. <!-- @noserver -->
4. A read is a function of `services/post.ts` (Reads has the rules):

   ```ts
   // services/post.ts
   export async function listPosts() {
     'use cache'
     cacheTag('post')
     cacheLife('minutes')
     return call(getApiPost({ client: createApi() })) <!-- @server -->
     return [] // your own source <!-- @noserver -->
   }
   ```

<!-- @server-start -->
5. A mutation is an export of `actions/post.ts` over a write of `services/post.ts` (the blocks
   under Mutations) and a client leaf that runs it, in the route's `_components/`:
<!-- @server-end -->
5. A mutation is an export of `actions/post.ts` (Mutations has the rules) and a client leaf that runs it, in the route's `_components/`: <!-- @noserver -->

   ```tsx
   // app/(site)/post/_components/rename-post-button/rename-post-button.tsx
   'use client'
   export function RenamePostButton({ id }: { id: string }) {
     const { execute } = useAction(renamePost)
     return <Button onClick={() => execute({ id, title: 'Renamed' })}>Rename</Button>
   }
   ```

6. A section composes them: an async Server Component in `_components/` with a skeleton of the
   same layout beside it (`post-list-skeleton.tsx`):

   ```tsx
   // app/(site)/post/_components/post-list/post-list.tsx
   export async function PostList() {
     await connection()
     const result = await load()
     if (!result.ok) return <ErrorState title="Posts" description={result.message} />
     return result.posts.map((post) => <PostRow key={post.id} post={post} />)
   }

   // The catch lives in a helper, not around JSX; Next's own signals pass through.
   async function load() {
     try {
       return { ok: true as const, posts: await listPosts() }
     } catch (error) {
       unstable_rethrow(error)
       const message = error instanceof ActionError ? error.message : DEFAULT_COPY.internal <!-- @server -->
       const message = error instanceof ActionError ? error.message : 'Something went wrong.' <!-- @noserver -->
       return { ok: false as const, message }
     }
   }
   ```

7. A page is a `Page`, a `PageHeader` and the section inside `Suspense`, with `page.scss` beside it,
   imported last. The group's `loading.tsx` and `error.tsx` cover the route.

   ```tsx
   // app/(site)/post/page.tsx
   import './page.scss'

   export default function PostPage() {
     return (
       <Page className="post-page">
         <PageHeader title="Posts" />
         <Suspense fallback={<PostListSkeleton />}>
           <PostList />
         </Suspense>
       </Page>
     )
   }
   ```

8. A top-level screen also gets its entry in `src/app/nav.ts` (`{ href, label }`).
9. Configuration only through `src/core/config/env.ts`; a browser-visible value is `NEXT_PUBLIC_*`,
   declared in a separate public schema and listed in `.env.example`.
10. No scaffolder: never run a generator here. A new primitive is a folder in `shared/components/`.

**The shell.** The template renders no header, navigation or footer: `app/(site)/layout.tsx` is
the skip link and the page's one `main`. A product's chrome is a component in `layout/` that
the layout renders between the skip link and `<main>`; `layout/` never imports `app/`, so the
layout passes `NAV` in as a prop typed `NavEntry[]` (`@/models/nav/interface`). `AppUserMenu` is the control
to place (it carries the theme items); `AppThemeMenu` is only those items and throws outside a menu.

<!-- @server:auth-start -->

With the server's auth, place `AppAccountMenu` in the chrome. It reads the session at request
time, so it sits in `Suspense`; without it `next build` fails (the e2e, the image), not `check`:

```tsx
<Suspense fallback={<AppAccountMenuSkeleton />}>
  <AppAccountMenu />
</Suspense>
```

<!-- @server:auth-end -->

`main` has no width and no padding: a screen gets its container from `Page`, and a full-bleed
screen skips it.

### Reads

A section is a request-time hole. `next.config.ts` turns on Cache Components: a route's static shell
is built once and everything that needs data streams in at request time, so the image build needs
no API.

<!-- @server-start -->
- **Public data** (the same for every visitor): the read in `services/<noun>.ts` starts with
  `'use cache'`, then `cacheTag('<noun>')` and `cacheLife('<profile>')` (`seconds`, `minutes`,
  `hours`, `days`), then `call(getApiX({ client: createApi() }))`. No `try/catch` in the read: it
  throws on failure (a thrown read is never cached) and Next's prerender signals must pass through.
  Cookies and headers are forbidden inside `'use cache'` (the build fails); read them outside and
  pass the value in.
<!-- @server-end -->
- **Public data** (the same for every visitor): the read in `services/<noun>.ts` starts with `'use cache'`, then `cacheTag('<noun>')` and `cacheLife('<profile>')`, and returns its data. No `try/catch`: it throws on failure (a thrown read is never cached) and Next's prerender signals must pass through. Cookies and headers are forbidden inside `'use cache'`; read them outside and pass the value in. <!-- @noserver -->
- **The section**: `await connection()` is its first line, then the read. It catches in a helper
  (not around JSX), calls `unstable_rethrow(error)`, and renders `ErrorState` with the
  `ActionError` message. The `PostList` block in step 6 is the pattern.
<!-- @server:auth-start -->
- **Per-user data**: a read with no `'use cache'`. It takes the token from
  `const { accessToken } = await requireAccount('/path')` and builds `createApi({ accessToken })`;
  reading cookies makes the section dynamic, so it sits inside `Suspense` like any other.
<!-- @server:auth-end -->
- **Expiry**: a mutation calls `updateTag('<noun>')` (Server Actions only), never `revalidatePath`:
  the next render reads fresh data in the same response, so the person sees their own write. Use
  `refresh()` from `next/cache` only to re-render an uncached read. The cache store is in memory,
  per server instance (see Deployment).

### Mutations

`core/actions/safe-action.ts` holds the client every action starts from: `action`.
<!-- @server-start -->
```ts
// services/post.ts
export async function updatePost(id: string, body: { title: string }) {
  return patchApiPostById({ client: await createRequestApi(), path: { id }, body })
}

// actions/post.ts
'use server'
export const renamePost = action.inputSchema(renamePostSchema).action(async ({ parsedInput }) => {
  const post = await call(
    updatePost(parsedInput.id, { title: parsedInput.title }),
    RENAME_POST_COPY,
    { schema: renamePostSchema },
  )
  updateTag('post')
  return post
})
```
<!-- @server-end -->
An action is `action.inputSchema(schema).action(handler)`, and the handler ends with `updateTag('<noun>')`. <!-- @noserver -->

<!-- @server-start -->
- A write is a function of `services/<noun>.ts` that returns the client's result, not the data:
  the action hands it to `call` with its own copy and schema. It builds its client with
  `await createRequestApi()` (it adds the visitor's address when `CLIENT_IP_HEADER` is set); a
  public cached read uses plain `createApi()`. Never use the
  module-level `client` the generated code exports: it is shared by every request and points at `/`.
- `call(request, copy, options)` returns the data or throws an `ActionError` whose message is the
  copy table's entry for the envelope's `code`, then the default (Errors); the server's own text
  never reaches the browser. `options.schema` lets a 400 with details become errors on those
  fields, `options.fields` (`{ conflict: 'email' }`) puts a code on one field instead of a toast,
  `options.discriminator` reads a second key from the envelope (`conflict:slot_taken`).
<!-- @server-end -->
- `handleServerError` returns an `ActionError`'s message as `serverError` and logs and masks
  everything else.
- A page that redirects after a success does it in the action (`redirect()`), after cookies are set.
<!-- @server:auth-start -->
- For a signed-in account start from `accountAction`: it reads the session on every call, refuses
  with "Sign in to continue." when there is none, and puts it in `ctx.session` (pass
  `ctx.session.accessToken` to the write, which builds `createRequestApi({ accessToken })`). `roleAction('admin')` adds a role check
  and refuses with "You don't have access to this.".

<!-- @server:auth-end -->

### Forms

React Hook Form with `zodResolver`, wired by `useHookFormAction` (from
`@next-safe-action/adapter-react-hook-form/hooks`).

<!-- @server-start -->
- The schema is in `actions/<noun>.form.ts` and extends the generated request schema
  (`zPostApiXBody.extend({ … })`); limits are never copied. A field whose message is ours sets
  that message itself, whatever the generated schema carries (the servers' schemas differ). The
  same schema goes to `.inputSchema` and to `zodResolver`.
<!-- @server-end -->
- The schema is in `actions/<noun>.form.ts`; the same schema goes to `.inputSchema` and to `zodResolver`. <!-- @noserver -->
- `<Form form={form} onSubmit={ignoreNavigation(handleSubmitWithAction)}>` provides the context; `TextField`,
  `TextareaField`, `NumberField`, `SelectField`, `CheckboxField`, `PasswordField` and
  `DateTimeField` (all in `shared/components/form/`) take a `name` and a `label`. An error shows
  under its field with `aria-invalid` and `aria-describedby`; the submit row is `FormActions`.
- Every form is a `Form`, never a bare `<form>`: it renders `method="post"`, so a submit before
  the page hydrates (the browser's own) never puts a field in the URL, and sets `data-hydrated`
  once React owns it, which an e2e helper waits for before it submits.
- A field error from the server arrives as `validationErrors` and the adapter places it on the
  field. The toast reports the outcome (`serverError`, a success) and never repeats a field error,
  except one for a field the form does not have (`unplacedMessage` in `form/action-form/action-form.ts` returns
  its text, with `hasField`). Toasts fire from `actionProps` callbacks or handlers
  after the await, never from an effect.
- `ignoreNavigation` (`shared/components/form/action-form/action-form.ts`) wraps the submit handler of every
  form: an action that ends in `redirect()` makes `executeAsync` reject with Next's navigation
  error (a `digest` starting `NEXT_REDIRECT`, `NEXT_NOT_FOUND` or `NEXT_HTTP_ERROR_FALLBACK`),
  which the wrapper ignores; it rethrows anything else.

### Dates

`shared/utils/date.ts` (`date-fns` v4 with `@date-fns/tz`) converts between an instant and a wall
time in a named zone; nothing reads the machine's zone. `wallTimeToInstant` refuses a time inside a
daylight-saving gap and takes the earlier instant for an ambiguous one; `dayKey`, `formatDate` and
`formatDateTime` work in the zone. A form holds an instant (ISO with `Z`); `DateTimeField` takes the zone.

<!-- @server:auth-start -->

### Auth

The API's tokens live in this server's own HttpOnly cookies, `access_token` and `refresh_token`
(path `/`, `SameSite=Lax`, `Secure` when `NODE_ENV` is `production`, lifetimes from the API's
expiry fields). The browser never talks to the API and never holds a token in JavaScript.

- `proxy.ts` refreshes: when the access token is missing or expired (`exp` is read without
  verifying, the API verifies) and a refresh token exists, it calls `POST /api/auth/refresh`,
  rotates both cookies, and hands the new ones to the same request's render. A refusal (400, 401,
  403) clears both cookies; an outage or a rate limit changes nothing. Concurrent requests in one
  process share one refresh. It never redirects and never checks permissions.
- `core/auth/session.ts` is the data access layer: `readSession()` (memoised per request with
  React `cache`) asks `GET /api/user/me` (`getMe` of `services/user.ts`) with the cookie's token as a bearer and returns
  `{ user, accessToken }` or `null`, failing closed; `requireAccount(returnTo?)` redirects a
  visitor to `/sign-in?next=…`; `requireRole('admin', returnTo?)` does the same and sends an
  account with another role to `/forbidden`. The role is the API's answer, never a claim in the token.
- `actions/auth.ts`: `signUp`, `signIn` and `signOut`, over `services/auth.ts`. A success sets the cookies and
  redirects to a safe `next` path (`safeNextPath` accepts only a path on this site); `signOut`
  clears the cookies even if the API cannot be reached.
- `actions/auth.form.ts`: the schemas run the generated email check and `z.email()` in one `superRefine`
  (one server's schema has no format check); `SIGN_IN_COPY` maps 401 to "Email or password is
  wrong." because the API cannot tell the two apart. `SignInForm` and `SignUpForm`
  (`app/(auth)/*/_components/*/`) are the form pattern.
- **Guarding a page.** Every page and read that needs an account calls `requireAccount()`; one
  limited to a role calls `requireRole(role)`. A layout re-renders only when its segment changes,
  so a layout check alone does not protect a navigation: check in the page and the read as well.
  Actions use `accountAction` or `roleAction(role)`.
- **Staff pages.** Put them in a `(site)/(staff)` group whose `layout.tsx` calls
  `requireRole('admin')`, and call it again in every page and read. The template ships none.
- **Renaming the roles.** The roles are `user` and `admin`. A product that renames them changes the
  role type guard in `core/auth/session.ts` (another role reads as signed out), every
  `requireRole(...)` and `roleAction(...)` call, the role-gated group, the unit tests that use a
  role, and this file, after the server's roles and the `contract` command. A role-gated route also
  needs a setup in the e2e screens list (Tests).
- `AppAccountMenu` is the account menu a product places in its header; the template renders it
  nowhere, and the profile page carries Sign out. The email is in the menu, never header text.

<!-- @server:auth-end -->

## Styling

- **Two homes.** `src/styles/` holds global and app-wide CSS only: `styles.scss`, `setup/`
  (`variables`, `breakpoints`, `functions`, `mixins`, `typography`, `layers`), `themes/` (`light`,
  `dark`, `brand.css`), `basics/` (`helpers`, `base`, `layout`). Every page, layout and component
  owns a sibling `.scss` with its stem, imported last in its file; it `@use`s `setup/...` only (the
  Sass load path is set in `next.config.ts`). A partial two sibling files share (`form/controls.scss`:
  `input.tsx`, `textarea.tsx`) is imported by each. `app/layout.tsx` and
  `app/global-error.tsx` import Inter, `themes/brand.css`, then `styles.scss`; nothing else does.
- **Layers.** `setup/_layers.scss` declares `@layer setup, themes, basics, kit`; the global
  partials wrap their rules in their layer. **A sheet under `shared/components/` wraps its rules
  in `@layer kit { }` and every other sibling sheet is unlayered, so a page or `app-*` sheet always
  beats the kit and the global tree**, at any specificity and in any chunk order (`next dev` copies
  a shared sheet into each route chunk, so source order between unlayered sheets does not hold).
  Never write `@layer` in a page or component sheet. `toaster/toaster.scss` is the one kit sheet with
  `!important`: Sonner's stylesheet is unlayered, and an important declaration in a layer beats it.
- **Classes.** BEM (`.button--primary`, `.page-header__title`) composed with `cn` from
  `@/shared/utils/cn`. A block's name is unique across the app: a loaded sheet stays in the
  document after a navigation, so two blocks with one name collide.
- **Tokens.** The generator writes the brand's light and dark colour blocks, `--radius` and
  `color-scheme` into `themes/brand.css` under `:root` and `[data-theme='dark']`: plain CSS, since
  its placeholders are not valid Sass (`.prettierignore` lists it). `themes/_light.scss` and
  `_dark.scss` hold the tokens beyond that set (surfaces, `--border-strong`, `--focus-ring`,
  skeleton, `--backdrop`, shadows), the same keys in both; `setup/_typography.scss` takes the
  brand's font stack. Never a literal colour. Spacing is `space()` on a 4 px base (`space(4)` is
  16 px); breakpoints `sm` 576 to `xxl` 1536 through `breakpoints.up()`; mobile first.
- **Theming.** `next-themes` (`ThemeProvider` in `app/layout.tsx`, `attribute="data-theme"`,
  default from the brief) sets `data-theme` on `<html>` to `light` or `dark` with its own blocking
  script before first paint. `AppThemeMenu` writes the choice, `Toaster` follows it. No
  `prefers-color-scheme` block.
- **Sizing.** A control is 36 px on a fine pointer, 32 px under `[data-density='compact']` (set at
  generation on `<html>`) on a fine pointer, 44 px on `(pointer: coarse)` whatever the density;
  icon buttons the same square. Use the `setup/_mixins.scss` mixins in this order:
  `control-height`, `compact-density`, then `touch-target` last. No page scrolls horizontally.
- **Primitives** are Radix (`radix-ui`) with the tree's classes; its data attributes
  (`data-state`, `data-side`) are the styling hooks. One icon set (`lucide-react`, `aria-hidden`
  next to a label), one toast implementation (`sonner`).
- **Patterns** in `shared/components/`: `Page`, `PageHeader`, `Section`, `EmptyState`,
  `ErrorState` (with retry), `ListSkeleton`, `CardSkeleton`, `FormActions` (sticky on phones),
  `ConfirmDialog`; `AuthCard` with auth. `main` has no width and no padding: every route that
  renders in it (a page, the 404, the group's loading and error) is wrapped in `Page`, which
  carries the width, gutters and padding; a full-bleed screen renders without it. Use a pattern
  before writing a layout by hand; a page never adds a landmark set.
- **Forms** use `shared/components/form/`, never a raw `input`. **Status** is a `Badge` by meaning
  (`success`, `warning`, `destructive`, `muted`, `info`) with words or an icon, never colour alone.
  Semantic HTML, labelled controls; the target is WCAG 2.2 AA, checked by the axe scan.
- **Enforced by** `tests/unit/styles-tree.test.ts` (`src/styles/` holds only the global tree, every
  sheet has its owner imported last, no `style` attribute, `layout/` components carry `app-`, the
  layer rules above) and `tests/unit/density.test.ts` (compiles the tree, asserts the three sizes).

## Errors

- Every route has a loading and an error state, its own or its group's: `loading.tsx`, `error.tsx`
  and `not-found.tsx` per route group, `global-error.tsx` at the root. Every section has a skeleton
  that matches its layout. Messages are user-safe: no stack trace, query text, internal URL or secret.
<!-- @server-start -->
- The generated client does not throw on an HTTP error status: it returns
  `{ data, error, response }`, and on a network failure `response` is undefined and `error` is the
  thrown value. `call` (`src/services/call.ts`) handles both, in that order, and is the only
  place that reads the result. Do not read `error` yourself.
- `call` throws an `ActionError` whose message is copy we wrote. The lookup is the model's copy
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
  | `payload_too_large` (413)        | That is too large to send.                                   |
  | `unsupported_media_type` (415)   | That kind of file isn't supported.                           |
  | `rate_limited` (429)             | Too many attempts. Wait a few minutes and try again.         |
  | `internal` (500)                 | Something went wrong on our side. Try again.                 |
  | `upstream_unavailable` (502-504) | The service is unavailable right now. Try again in a moment. |
  | no response (`network`)          | Can't reach the server. Check your connection and try again. |

  A model overrides the entries that need its own words.
<!-- @server-end -->
- A failure in an action is an `ActionError` whose message is copy we wrote; `handleServerError` hands it to the browser and masks everything else. <!-- @noserver -->

- A public cached read lets the `ActionError` propagate; the section renders `ErrorState`. An
  unexpected error reaches the nearest `error.tsx`. In an action, `ActionError` becomes
  `serverError`; anything else is logged by `handleServerError` and becomes "Something went wrong.
  Try again." The client leaf shows `serverError` with `toast.error` from its handler.

## Tests

- Unit tests sit beside their source (`src/**/*.test.ts(x)`) and run with `bun run test` (Vitest,
  React Testing Library, jsdom). Components: props in, roles and text out, with `userEvent` for
  input. Async sections render as `render(await Section())`. Reads and actions run with the API
  stubbed through `vi.stubGlobal('fetch', ...)`; no test starts the server. `server-only` is
  aliased to `tests/stub/server-only.ts` in `vitest.config.mts`; Vitest stubs a stylesheet import.
  Mock a Server Action module (`vi.mock`) in a component test.
- `tests/unit/` holds the tooling checks: `eslint-boundaries`, `styles-tree` and `folders` (with
  seeded temporary trees; `folders` holds the model and component folder rules), `density`,
  `use-cache`, `screen-routes` (`capturedRoutes`), `e2e-base-url`
  (blank `E2E_BASE_URL`).
- Next request APIs are boundaries: mock `next/cache` (`cacheTag`, `cacheLife`, `updateTag`),
  `next/server` (`connection`) and `next/headers` (`cookies`). `'use cache'` is inert under Vitest:
  assert the directives' calls (`cacheTag('post')`). A safe action is called as a function and
  returns `{ data, serverError, validationErrors }`; a `redirect()` surfaces as an error whose
  `digest` starts with `NEXT_REDIRECT`.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`): one test per user
  journey, each with an axe scan (`support.ts` has the scan). Install the browser once with `bun x playwright install chromium` (add
  `--with-deps` on Linux). Scan a settled page: a closed menu, a section past its skeleton.
  `openMenu` (`support.ts`) clicks a Radix trigger until its first item shows, because a click
  before hydration opens nothing.
<!-- @server-start -->
- `bun run test:e2e` tests the **production build**, not the dev server. Playwright starts two web
  servers, both with `reuseExistingServer: false` (stop a dev server on port 3000 first):
  - the API, fresh every run, with `RATE_LIMIT_SCALE=100` so the suite does not trip the rate limits,
    started with the server's start command (`commands.start`);
  - this app: `scripts/e2e-server.mjs` runs `bun run build`, copies `.next/static` and `public/`
    into `.next/standalone` and runs `server.js`, the server the image runs. `next start` would
    also work but warns under `output: 'standalone'`.
<!-- @server-end -->
- `bun run test:e2e` tests the **production build**, not the dev server. Playwright starts only this app (`reuseExistingServer: false`; stop a dev server on port 3000 first): `scripts/e2e-server.mjs` runs `bun run build`, copies `.next/static` and `public/` into `.next/standalone` and runs `server.js`, the server the image runs. <!-- @noserver -->
<!-- @server:database-start -->
- With a database the API gets the browser-test database, `app_e2e` (the provider's `e2e` URL;
  `E2E_DATABASE_URL` overrides it; a blank value is ignored and a name not ending in `_e2e` is refused
  when the config loads), never the development one. The API's command is
  `<server e2eDb> && <server start>`: `e2eDb` creates `app_e2e` when missing, migrates it and
  truncates it, and refuses a name that does not end in `_e2e`. It runs inside the web server command
  and not in a `globalSetup`, because Playwright starts its web servers **before** global setup and the
  API would connect to a database that does not exist yet. Start the database service first
  (`docker compose up -d --wait <service>` at the project root); no `migrate` is needed.
  `tests/unit/e2e-database-url.test.ts` pins the name check.
<!-- @server:database-end -->
<!-- @server-start -->
- `E2E_BASE_URL` set (a blank value counts as unset): nothing is started and the tests target that origin (the catalog's case runner
  sets it against the Compose stack, `withApp`). There the API is the production one, with its normal
  rate limits and its own database: the limit is 10 registrations per 15 minutes for the one shared
  per-IP bucket and a run sends eight, so run it once per 15 minutes per stack. It leaves eight
  users in that stack's `app` database.
<!-- @server-end -->
- `E2E_BASE_URL` set (a blank value counts as unset): nothing is started and the tests target that origin. <!-- @noserver -->
- Playwright has two projects: `phone` (`Pixel 7`, touch) runs every spec, so every journey and its axe
  scan run on the phone; `desktop` (`Desktop Chrome`) runs `shell.spec.ts` and `screens.spec.ts` only.
  A check for one project carries a `@phone` or `@desktop` tag and the other filters it out with
  `grepInvert` in `playwright.config.ts`; never `test.skip` at run time.
  `retries` is 0 and a trace is kept for a failed test: a flaky test is diagnosed, not retried.
- `tests/e2e/shell.spec.ts` asserts the skip link (first in the tab order, focuses `main`), one `main`
  with id `main`, no horizontal overflow, the 404 inside `main`, 44 px targets on `phone` (`@phone`),
  the 36 px and 32 px densities on `desktop` (`@desktop`), and that `data-density="compact"` does
  not shrink a touch target. A product's header and navigation add their own assertions there.
- `tests/e2e/screens.spec.ts` writes a full-page screenshot of every route in `app/nav.ts` (and the
  sign-in and sign-up screens with auth) to `test-results/screens/<route>-<viewport>-<theme>.png`
  (`phone` and `desktop`, `light` and `dark`; the home route is `home`); QA reads them. A route
  added to `nav.ts` is captured without touching the spec, unless it is also in `SIGNED_IN_ROUTES`
  (then only signed in); a screen outside the nav is added to its `ROUTES`. Each is also checked,
  per route, theme and project: no axe violation of the WCAG A and AA tags (in dark this is the
  contrast measurement), no horizontal scroll, exactly one `h1`; a failure names the route, theme
  and project (`screenProblems` in `support.ts`).
<!-- @server:auth-start -->
- `auth-support.ts` has the sign-up, sign-in and sign-out helpers. The signed-in screens are
  `SIGNED_IN_ROUTES` in the same spec (`/profile`, `/forbidden`), captured and
  checked the same way after signing up through the form; entries without a `setup` share one account
  per project. A role-gated route is an entry with a `setup(account)`, which the project writes in its own
  e2e support file (for example promoting `account.email` to the role); the entry gets its own
  account. A setup writes only to `account.databaseUrl`, the browser-test database (refused unless its
  name ends in `_e2e`), and never reads a connection string from the environment; without a database
  it receives `never`. With `E2E_BASE_URL` set the entries with a `setup` are left out, so a setup
  never reaches a development or production database. After a `setup` the spec signs out and in again
  through the form, because the role is a claim in the session's token. Each signed-in test sets its
  own timeout; no `storageState` setup project.
<!-- @server:auth-end -->
- A journey creates its data through the UI with an email unique to the run (`uniqueEmail()`), and
  never takes the database's contents as a precondition.
<!-- @server:auth-start -->
- `tests/unit/proxy-config.test.ts` pins which paths the proxy matcher refreshes.
<!-- @server:auth-end -->
- `tests/unit/use-cache.test.ts` fails when a file with `'use cache'` imports request-scoped code
  (`next/headers`, the session, the request client); it is proved on seeded sources.
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
  non-root `node` user and listens on `3000`. The build needs no API: every data section is a
  request-time hole.
<!-- @server-start -->
- **Compose service.** The root `docker-compose.yml` builds the package from its `Dockerfile`
  under the `app` profile, so `docker compose --profile app up --build` starts it. With a server
  in the plan it gets `API_URL` (the server's name and port on the Compose network) and waits
  for the server. Stop it with `docker compose --profile app down`: a plain `down` does not see
  profile services.
<!-- @server-end -->
- **Compose.** A package generated alone has no `docker-compose.yml`: build and run the image from its `Dockerfile` (port `3000`). <!-- @noserver -->
<!-- @server-start -->
- **Port.** Published as `3000:3000`, which Docker binds on every interface; the default is for a
  local run. In production only a proxy you control may reach it (see the production recipe below);
  the server behind it is published on loopback only. API calls are made by the Next.js server
  through `API_URL`, not by the browser.
<!-- @server-end -->
- **Port.** The container listens on `3000`; in production only a proxy you control may reach it. <!-- @noserver -->
<!-- @server-start -->
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
  server's `TRUST_PROXY` must count this server as a hop. Public cached reads never forward.
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
<!-- @server-end -->
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
