# ADR 0013: One set of folder rules for every frontend, and `signup`

Status: accepted; the rules and the names are Eitan's words of 2026-11-11, given while
`frontend/next` 4.0.0 waited for its release. The rows marked ▲ are the session's readings, made
while applying them, and stand for his review. Built on `feat/next-entity-folders` (the servers on
`feat/signup-endpoint`). Catalog release `v1.12.0`: `frontend/next` 4.0.0, `frontend/react` 6.0.0,
`frontend/vue` 4.0.0, `frontend/angular` 4.0.0, `server/bun-express` 3.0.0,
`server/python-fastapi` 2.0.0. Amends [ADR 0009](0009-pages-components-colocated-styles.md)
(`components/` is no longer a layer name; a page's own components need no `components/` folder),
[ADR 0007](0007-react-redux-rtk-scss.md) ("`models/<noun>.ts` is a file, not a folder") and
[ADR 0012](0012-next-spa-tree-colocated-scss.md) (N1's closing rules, which this record carries to
the other three frontends). The ten invariants of `docs/conventions.md › Frontend` hold.

## Context

- ADR 0012 put zod form schemas, copy tables and zod's message map in Next's `models/`. Asked what
  `models/` holds, the owner answered with the layout he wants in every frontend.
- The four frontends disagreed with it in different places: all four had a top-level `components/`
  beside `shared/components/`; React and Next kept `models/<noun>.ts` files with helpers in them;
  Vue and Angular kept functions, an error class and specs in `models/` and spelled the constants
  file `constants.ts`; React, Vue and Next kept a component's files flat; no template kept its form
  controls in the form folder; Next's actions and session code called the generated client
  themselves.
- He also named the sign-up flow: "signup", not "register", in the frontends and as the servers'
  endpoint.

## Decisions

### F1. `models/`

One folder per entity. A folder holds only `interface.ts`, `type.ts`, `enum.ts` and `constant.ts`,
each when needed. `interface.ts` holds `interface` declarations and `type.ts` holds `type` aliases;
each template's lint forces the keyword per file kind.

▲ What left `models/`: a pure helper or type guard went to `shared/utils/`; a helper about the
API's error envelope went to `services/` (React `with-copy.ts`; Vue and Angular `api-error.ts`),
and where a layer that needs it may not import `services/` or `shared/`, to `core/config/` (Vue and
Angular `error-copy.ts`); a form's zod schema and copy went to the module that owns the form
(Next: `actions/<noun>/<noun>.form.ts` and `.copy.ts`, because the action validates with the schema).

### F2. `services/`

The API calls per entity and the facades of libraries; a pure utility facade is `shared/utils/`.
Only `services/` calls the generated client's functions. Next gained `services/auth.ts` (`login`,
`signup`, `logout`, `refresh`) and `getMe` and `getProfile` in `services/user.ts`; its lint refuses
a value import of the generated client from any other layer.

▲ File names keep each framework's suffix: `user.ts` in Next, `user.api.ts` in React (an RTK Query
slice), `user.service.ts` in Vue and Angular.

### F3. One folder named `components`

`shared/components/` is the only one. The app's chrome is `layout/` (Angular: `app/layout/`), files
still named `app-*`. A page's or module's own components sit directly in the page's folder; React's
`pages/<module>/components/` is gone.

▲ Next keeps `_components/` inside a route folder: Next routes every folder under `app/` that holds
a `page.tsx`, the underscore is the framework's way to keep a folder out of routing, and the
`route-components` lint keys on the name.

### F4. The form folder

The form controls, the field wrapper, the actions row and the field bindings sit in
`shared/components/form/`.

### F5. Component folders

A component of two or more files (template, class, sheet, test) is a folder named for it; one file
stays a file. It holds in `layout/`, `shared/components/`, `pages/` (a page is a component) and
`app/`. Next's route files (`page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx` and their
sheets) are already in the folder that names them.

▲ Controls that share one sheet stay sibling files beside it (`form/controls.scss` with `input` and
`textarea`; Vue's four `base-*` controls, whose four specs became one `form-controls.spec.ts` with
the same tests), because a sheet import is the owner's sibling.

### F6. `signup`

The servers' endpoint is `POST /api/auth/signup` (was `/api/auth/register`), with the same request,
responses and limits; the event topic is `user.signedup`. The frontends' service functions, pages,
components, translation keys and, in Vue and Angular, the route `/auth/signup` follow. React and
Next keep the `/sign-up` URL and their `signUp` spellings. A generic use of the verb (registering a
route, a schema, a service worker) is not the flow and keeps its name.

### F8. Next: `actions/` holds one folder per noun

The owner, 2026-11-12: files that all belong to one noun sit in a folder named for it.
`actions/auth/` holds `auth.ts`, `auth.form.ts`, `auth.copy.ts` and their tests; every file in a
noun's folder is named for the noun. The folder test refuses an action file outside its folder.

▲ `services/` stays flat (`auth.ts` beside `auth.test.ts`): one module and its test, the same
reading as F5's one-file component. The other frontends have no `actions/`.

### F9. Next: `shared/utils/validation.ts` is the only file that imports zod

The owner, 2026-11-12: zod is wrapped by one utility file of properly named functions, so that a
library switch is made in one file. `validation.ts` exports the builders (`text`, `number`,
`email`, `url`, `isoDateTime`, `literal`, `object`, `extend`, `field`), the modifiers (`optional`,
`withDefault`, `check`, `transform`, `pipe`), the runners (`validate`, `isValid`, `parse`), the form
resolver (`formResolver`) and the types `Input` and `Output`, and it holds the message map
(`zod-messages.ts` is gone). Lint refuses `zod` and `@hookform/resolvers` in every other file,
tests included.

- ▲ The generated `services/generated/zod.gen.ts` still imports zod: Hey API's plugin writes it. A
  switch is `validation.ts`, that plugin's line in the generator config, and the two dependencies.
- ▲ The functions return the library's own schema types, so inference stays exact with no type
  layer of our own. The price: TypeScript does not stop a method call on a schema (`.min()`,
  `.safeParse()`); the agents file forbids it and the template has none.
- React, Vue and Angular keep their direct zod imports until the owner asks for the same there.

### F7. Enforcement

Each frontend has a folder test in its tooling tests (`tests/unit/folders.test.ts` or
`folders.spec.ts`): the `models/` file names, the component-folder rule, no top-level
`components/`, no `components/` under `pages/`; in Next also the `actions/` folders, and a lint case for the
validation library's imports. The layer lint renames its `components` element to
`layout`.

## Consequences

- Six template majors in one catalog minor. A project generated earlier keeps its tree, its
  endpoint and its client; there is no migration tool. To follow the endpoint by hand, rename the
  route on the server and regenerate the frontend's client.
- A generated project's two halves must come from the same catalog version: a frontend from this
  release calls `/api/auth/signup`, which an older server does not serve.
- The server templates' own `models/<entity>/constants.ts` keeps its plural spelling; the rules
  were given for the frontends.

## Out of scope

Renaming the sign-in or sign-out endpoints. A shared kit package. The server templates' folders.
