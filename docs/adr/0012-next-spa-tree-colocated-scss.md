# ADR 0012: Next on the SPA layer names, with co-located SCSS

Status: accepted on the session's reading of Eitan's "start plan 025" (2026-11-11), which carries
the program he approved on 2026-11-10 (decisions 4 and 5: "Next tree = SPA mirror", "Next styling =
co-located SCSS"; he chose the second over the session's recommendation to keep Tailwind and
shadcn). The rows marked ▲ are the session's, made while writing this record, and stand for his
review; the kit layer of N3 is his choice on the spike's result, and the folder rules that close
N1 are his words of 2026-11-11, given before the release. Built by harness plan 025 on
`feat/next-spa-tree` and `feat/next-entity-folders`. Catalog release `v1.12.0`:
`frontend/next` 4.0.0; the other frontends and the servers are unchanged. Amends
[ADR 0005](0005-frontend-foundation.md) (Next's Feature-Sliced layers, the shadcn design system and
Tailwind leave), [ADR 0006](0006-per-framework-frontends-and-angular.md) (the SCSS tree reaches
Next: "once a build proves it costs nothing" is spike S5) and
[ADR 0009](0009-pages-components-colocated-styles.md) (Next joins C1 to C3 with its own layer map).
The ten invariants of `docs/conventions.md › Frontend` hold; invariant 6 loses one alternative (N3).

## Context

- `frontend/next` 3.1.0 is the last template on the foundation of ADR 0005: `app/` for routing,
  `widget/`, `feature/`, `entity/`, `shared/` (Feature-Sliced), Tailwind 4 and copied shadcn
  primitives, one `globals.css`, unit tests in `tests/unit/`.
- The three single-page templates moved on: `pages/`, `components/app-*`, `services/`, `store/`,
  `models/`, `shared/`, `core/`, `styles/`, a sibling `.scss` beside every page and component over
  a global tree in cascade layers, unit tests beside their source (ADR 0007 to 0010).
- A team that reads one generated frontend cannot read the Next one: a page section is a `widget`
  there and a component elsewhere, a read lives in `entity/<noun>/server/` there and in `services/`
  elsewhere, and the same button is a class list in one and a BEM block in the others.
- Next cannot copy the SPA tree file for file. `src/pages/` is reserved by the Pages Router, the
  App Router owns the route files, and a read or a mutation runs on Next's server, not in the
  browser. So Next takes the layer **names** and keeps its own mechanics.
- What moves: every file under `src/` except the route files' places in `app/`, `proxy.ts` and
  the generated client's content; 44 unit tests; the `onlyWhen` lists; `eslint.config.mjs` and its
  local rule; `AGENTS.md` (650 lines name the old layers on most of them). The cases, the e2e
  journeys, the Dockerfile and the Compose fragment keep their behaviour.

## Decisions

### N1. The tree

| Old (3.x) | New (4.0.0) |
| --- | --- |
| `app/**` route files | unchanged. `app/` is the pages layer: a route's own pieces live in `app/<route>/_components/` (Next never routes a `_` folder) |
| `widget/<s>/ui/*`, `feature/<a>/ui/*`, `entity/<n>/ui/*` | the route's `_components/`; `layout/app-<name>` when a layout or more than one route renders it |
| `entity/<n>/model.ts`, `feature/<a>/model.ts` | `models/<entity>/{interface,type,enum,constant}.ts`: the entity's shapes and constants, nothing else. A form's zod schema is `actions/<noun>.form.ts`, its copy `actions/<noun>.copy.ts`, a pure helper `shared/utils/` |
| `entity/<n>/server/<n>.ts` | `services/<noun>.ts`: the entity's API calls, reads and writes (`server-only`; a public read starts with `'use cache'`) |
| `shared/api/{client,call,index}.ts`, `shared/api/generated/` | `services/{client,call}.ts`, `services/generated/`; the contract's types reach the rest through `models/<entity>/type.ts` |
| `feature/<a>/server/action.ts` | `actions/<noun>.ts` (`'use server'`): one file per noun, one export per action |
| `shared/lib/{safe-action,action-error}.ts` | `core/actions/` |
| `shared/auth/*`, `shared/config/env.ts` | `core/auth/`, `core/config/env.ts` |
| `shared/lib/{cn,date,zod-messages}.ts` | `shared/utils/` |
| `shared/ui/*`, `shared/ui/pattern/*`, `shared/ui/form/*` (shadcn) | `shared/components/<name>/` (a folder per component of two or more files) and `shared/components/form/` (the controls, `Form` and the bindings), each with its sibling `.scss`, ported from `frontend/react/base/src/shared/components` (N4) |
| `shared/ui/pattern/{theme-toggle,user-menu}.tsx`, `widget/account-menu` | `layout/app-theme-menu/`, `layout/app-user-menu/`, `layout/app-account-menu/` |
| `app/globals.css` | `styles/{styles.scss,setup/,themes/,basics/}`, React's tree (N3) |
| `tests/unit/*` | beside their source as `*.test.ts(x)`; `tests/unit/` keeps the tooling checks (N7) |

- `src/proxy.ts`, `app/nav.ts`, the route groups `(site)` and `(auth)`, and every route path stay.
- ▲ **`store/` is a named layer that ships no file.** It is the home of client-only state two or
  more routes read (a `'use client'` provider and its hook). The template has none: the theme is
  `next-themes`'. The agents file and the lint name the layer so a product's first shared state
  has one place; an empty folder is not committed.
- ▲ **`actions/` is keyed by noun, not by action**, so it reads like `services/`: `actions/auth.ts`
  exports `signIn`, `signUp` and `signOut`. The glossary still lists each action as a verb.
- A page is `page.tsx`, and its sheet is `page.scss` beside it; the route folder names both.
- **The owner's folder rules (2026-11-11).** `models/` is a folder per entity holding only
  `interface.ts`, `type.ts`, `enum.ts` and `constant.ts`, each when needed. `services/` is the
  facades of libraries and the API calls per entity; a pure utility facade is `shared/utils/`.
  One folder is named `components` (`shared/components/`): the app's chrome is `layout/`, and a
  page's own pieces sit in its route folder. The form controls sit in `shared/components/form/`.
  A component of two or more files is a folder named for it; one file stays a file.

### N2. Import rules and lint

| From | May import |
| --- | --- |
| `app/` (route files and `_components/`) | layout, services (not from a `'use client'` file), actions, store, core, shared, models |
| `app/<route>/_components/*` | as `app/`; imported only by files in the folder that holds that `_components/`, or below it |
| `layout/` | services (not from a `'use client'` file), actions, store, core, shared, models; never `app/` |
| `actions/` | services, core, shared, models |
| `services/` | `services/generated`, core, models |
| `store/` | core, shared, models |
| `core/` | services (the session read), shared, models, each other |
| `shared/` | shared, models |
| `models/` | models; the generated types (`import type`) |

- `eslint-plugin-boundaries` carries the table (`no-unknown-files` on, as in React), each message
  naming the layer to use instead.
- The local rule `client-server-import` is re-pathed: a `'use client'` file imports from
  `services/` and `core/auth/` types only, and from `actions/` freely.
- A new local rule, `route-components`: a file under a `_components/` folder is imported only from
  the folder that holds it or a folder below it, so a route and its nested routes share their
  pieces as a React module's pages share `pages/<module>/components/`. Unrelated routes that need
  one piece move it to `layout/app-<name>`.
- Kept, re-pathed: `button`, `input`, `select` and `textarea` JSX only in `shared/components/`;
  `fetch(` and `revalidatePath` only in `services/`; `process.env` only in `core/config/env.ts`.
  New, from React: no `style` attribute; a stylesheet import is the owner's sibling
  `./<stem>.scss`, last; only `app/layout.tsx` loads the global tree.
- `tests/unit/eslint-boundaries.test.ts` keeps one violation and one allowed case per rule.

### N3. Styling

- The global tree is React's, file for file: `src/styles/styles.scss`, `setup/` (`variables`,
  `breakpoints`, `functions`, `mixins`, `typography`, `layers`), `themes/` (`light`, `dark`,
  `brand.css` with the generator's blocks), `basics/` (`helpers`, `base`, `layout`), in cascade
  layers (`@layer setup, themes, basics`). `app/layout.tsx` imports Inter, `themes/brand.css`, then
  `styles.scss`; `app/global-error.tsx`, which replaces it, does the same, and nothing else loads
  them.
- Every page, layout and component owns a sibling `.scss` with its stem, imported as its last
  import; it `@use`s `setup/...` through the Sass load path. BEM classes composed with `cn`
  (`clsx` alone), each block's name unique across the app: a loaded sheet stays in the document
  after a navigation.
- **The kit is a fourth layer** (Eitan, 2026-11-11, on spike S5): the order is
  `@layer setup, themes, basics, kit`, and every sheet under `shared/components/` wraps its rules
  in `@layer kit { }`. A page's, a route piece's and an `app-*` component's sheet stay unlayered,
  so they beat the kit and the global tree at any specificity and in any chunk order. This is
  where Next differs from the SPAs, whose sibling sheets are never layered: `next dev` copies a
  shared sheet into every route chunk, so source order between two unlayered sheets does not hold
  there (S5, proof P8).
- Tailwind, `@tailwindcss/turbopack` and its loader rule in `next.config.ts`, `tw-animate-css`,
  `tailwind-merge`, `class-variance-authority`, `components.json` and the shadcn CLI step leave.
  `sass-embedded` arrives, at React's pin.
- **The dark selector is `[data-theme='dark']`**, as in the three SPAs: `next-themes` stays, with
  `attribute="data-theme"`. Invariant 6 of `docs/conventions.md` then names one selector.
- ▲ `next-themes` keeps its own blocking inline script. The template ships no
  `Content-Security-Policy`, so invariant 6's "a file, never inline" stays the SPAs' rule, where
  nginx sends `script-src 'self'`; `docs/conventions.md` says so in the same sentence.
- Sizing is React's mixins and numbers (36 px, 32 px compact on a fine pointer, 44 px on a coarse
  one). `tests/unit/styles-tree.test.ts` and `tests/unit/density.test.ts` are ported from React,
  with `app/layout.tsx` in `main.tsx`'s role, `page`/`layout` as owner stems, and the layer rule
  as above: a `shared/components/` sheet holds only `@use` lines, comments and its one
  `@layer kit` block; no other sibling sheet names a layer.

### N4. The kit

- `shared/components/` is React's set under React's names, classes and sheets: the primitives on
  Radix, the patterns (`Page`, `PageHeader`, `Section`, `EmptyState`, `ErrorState`, the skeletons,
  `FormActions`, `ConfirmDialog`, `AuthCard` with auth), `form/` with the field bindings.
- A primitive that holds state or a browser API, every Radix wrapper that needs one, and every
  form binding starts with `'use client'`; the rest stay Server Components. `next build` is the
  proof: it refuses a hook in a server file.
- Next's own pieces stay Next's: `form/action-form.ts` (`ignoreNavigation`, `unplacedMessage`),
  the `useHookFormAction` wiring, `Toaster` themed from `next-themes`. React's `report-failure`,
  its store and its hooks are not ported.
- No scaffolder: a new primitive is a folder in `shared/components/` with its sibling sheet.

### N5. Reads, mutations, auth

Behaviour is unchanged; only the homes move.

- A read is `services/<noun>.ts`; a section that shows it is an async Server Component in the
  route's `_components/` with a skeleton of the same layout, inside `Suspense`.
- A mutation is an export of `actions/<noun>.ts` built from `core/actions/safe-action.ts`, over a
  write of `services/<noun>.ts` that returns the client's result for the action's `call`; its
  schema is `actions/<noun>.form.ts` and its copy `actions/<noun>.copy.ts`, plain modules the
  action and the client form share.
- Auth: `core/auth/` (session, cookies, refresh, token, next-path), `models/user/`,
  `models/auth/`, `services/auth.ts`, `services/user.ts`, `actions/auth{,.form,.copy}.ts`, the screens' pieces in
  `app/(auth)/<route>/_components/`, `GuestOnly` in `app/(auth)/_components/`.

### N6. Tools

- ▲ `tools/lib/files.ts`: `GENERATED_CLIENT_DIR` becomes `src/services/generated/`, the directory
  Next now shares with React and Vue. The marker passes then skip it in those two as well; their
  generated output must not change (the proof is a diff of each default stack's generated tree
  against `dev`).
- Nothing else in the tools names a Next path: `onlyWhen` is manifest data, markers live in files.

### N7. Tests

- Unit tests sit beside their source (`src/**/*.test.ts(x)`); `tests/unit/` keeps `eslint-boundaries`,
  `styles-tree`, `density`, `use-cache`, `proxy-config`, `screen-routes`, `e2e-base-url` and, with a
  database, `e2e-database-url`. `.dockerignore` keeps `*.test.*` out of the image.
- The e2e suite asserts what it asserts today (`shell`, `smoke`, `screens`, `auth`); only a
  selector that named a Tailwind class or `.dark` changes.
- The seven cases stay: `default`, `auth-off`, `stack-postgres`, `auth-off-postgres`, `python`,
  `alone`, `brand`. A lone frontend stays a subset of its stack (ADR 0011).

### N8. Documents

- `frontend/next/base/AGENTS.md` is rewritten on the new names under the same five headings, with
  the recipe file by file; `README.md`; `CHANGELOG.md` 4.0.0 with a Breaking table.
- `docs/conventions.md` invariant 6 (N3); `CONTRIBUTING.md › Refreshing frontend/next/base` (no
  `--tailwind`, no shadcn step, the brand blocks go into `themes/brand.css`); `CLAUDE.md`'s
  frontend sentence; the README matrix; amendment lines in ADR 0005, 0006 and 0009.

### N9. Release

`frontend/next` 4.0.0, a template major (every source file moves); catalog `v1.12.0`, a minor, as
every earlier template major was. The tag is Eitan's. A project generated from 3.x keeps its tree;
there is no migration tool, and the harness's scaffold refuses a lock that differs from provenance.

### N10. The harness (plan 025)

The lock bump, and the wording that names Next's old layers or its utility classes:
`.doc/glossary.md › Actions`, `.doc/architecture.md › Data Flow`, `.claude/rules/ui-and-styling.md`,
`.claude/skills/deployment/SKILL.md`, `.claude/README.md › Frontend choice`.

## Alternatives considered

- **Keep Tailwind and shadcn in Next** (the session's recommendation on 2026-11-10: the ecosystem
  default, no port to maintain). Rejected by Eitan for one styling system across the four
  frontends.
- **CSS Modules**, Next's own answer to scoped styles. It gives scoping the BEM tree does not need
  and a fourth way to write a class; the goal is parity with the SPAs. Rejected.
- **Keep the Feature-Sliced names and only restyle.** Half the cost, and the two trees still read
  differently. Rejected with decision 4 of the program.
- **A `pages/` layer beside `app/`**, with `app/` re-exporting. `src/pages/` is the Pages Router's
  directory, and a re-export per route is ceremony. Rejected for `_components/`.

## Consequences

- One vocabulary across the four frontends for a noun's reads and its sheet; Next adds
  `actions/` and keeps `app/` as its pages layer.
- Next was the first template on the owner's folder rules; React, Vue and Angular follow in the
  same release ([ADR 0013](0013-owner-folder-rules-and-signup.md)).
- The kit is a port: a fix to a React primitive's sheet is copied to Next by hand until the kit is
  a shared part (out of scope).
- A brief that names Tailwind or shadcn no longer matches a template; the harness's bootstrap
  reports it as a gap, as it does any stack mismatch.
- A page's CSS ships with its route instead of one utility sheet for the site (S5 records the
  bytes).

## Out of scope

A shared kit package across React and Next. A migration tool for 3.x projects. `i18n` and `pwa`
flags for Next. A Content-Security-Policy for the Next template.

## Spike (the harness's, before any move)

- **S5. Sibling SCSS under Next 16 and Turbopack, with layers.** In a generated project with
  React's tree copied in: a sibling sheet imported from a Server Component and from a
  `'use client'` component, outside `app/` and in a route's `_components/`, builds and applies; an
  unlayered sibling rule beats a higher-specificity `basics/` rule on two routes, on a hard load
  of each and on a client navigation in both orders, in the production build and in `next dev`;
  the owner's sheet beats a composed component's rule at equal specificity in the same eight
  cases; the layer order statement reaches the browser first; no theme flash with `data-theme`;
  Vitest loads a component with a sheet and compiles the tree for the density numbers; the CSS
  bytes of a route are recorded beside the Tailwind baseline. **A failed proof is a stop that
  returns to Eitan**, not a fallback.

**Result (2026-11-11, next 16.4.2, sass-embedded 1.108.2).** Every proof passed in the production
build. In `next dev` one failed: an owner's sheet lost to a composed kit rule of equal specificity
after a navigation away and back, because dev copies the shared sheet into each route chunk. With
the kit in its own layer (S5b) all proofs pass in both modes, including a route whose kit sheet
arrives through a lazy client component; Eitan chose that (N3). Measured on the spike's two
routes: 9.0 kB of CSS (2.9 kB gzip) in three files against 62.8 kB (11.4 kB) for the Tailwind
sheet, which carried the whole kit; the build time did not move.

## Decisions made while building

- **Sass configuration (S5).** `next.config.ts` sets `sassOptions: { implementation:
  'sass-embedded', loadPaths: [<src/styles>] }`; it works under Turbopack in `next dev` and
  `next build`. Vitest stubs a stylesheet import by default, so `vitest.config.mts` needs no Sass
  option; the density test compiles the tree itself.
- **`shared/utils/zod-messages.ts` (C2, moved by C6).** C2 kept it in `models/` because a form
  schema lived there; the schema is in `actions/` since C6, which may import `shared/`.
- **`services/generated` is a lint element of its own (C2)**, so "types only" is enforceable for
  `models/`: `actions/`, `core/` and `services/` may import it, `models/` by `import type`;
  `app/`, `layout/`, `store/` and `shared/` read the contract through a model.
- **`onlyWhen` lists files of `services/`, not the folder (C2).** `validate` refuses a folder
  under one selection with a file inside it under another, and `services/user.ts` exists only
  with the server's auth.
- **Which kit files are client (C3).** `confirm-dialog`, `error-state`, `toaster` and every
  `form/` binding carry `'use client'`. The Radix wrappers, `Button` and the patterns do not: the
  Radix package marks its own primitives, and a build that rendered every wrapper from a Server
  Component passed.
- **`toaster.scss` uses `!important` (C3).** Sonner injects an unlayered stylesheet, which beats a
  layered rule; an important declaration in a layer beats it back. It is the one kit sheet that
  styles a third party's markup, and the six declarations sit on Sonner's root only.
- **`layout/app-auth-loading`** replaces the `AuthCardSkeleton` pattern (C3), as React has it.
  The Sass load path is `path.join(import.meta.dirname, 'src/styles')`.
- **From the review (C5).** `app/global-error.tsx` loads the global tree as `app/layout.tsx`
  does: it replaces the root layout and renders its own document, and without the import it drew
  with no tokens, font or reset. `route-components` lets a nested route import its parent's
  `_components/` (N2, first written as the holding folder only): the strict form pushed a
  module's own pieces into the app-wide layer. Both local rules also check a dynamic
  `import()`. Every file of `services/` imports `server-only` itself.
- **Lightning CSS rewrites the layer statement and the tokens (S5).** It emits only the part of
  the `@layer` order statement that names a layer with no block in that file (`@layer kit;`,
  after the `basics` block) and keeps the global blocks in source order, so the order holds. It
  writes each `oklch()` token as a hex value with a `lab()` block under `@supports`.
- **The owner's folder rules, applied (C6).** Built on `feat/next-entity-folders` before the
  release, so 4.0.0 ships one tree. The session's readings, for his review: the schema and the
  copy of a form go to `actions/`, not the route folder as in React, because the action validates
  with the schema and `actions/` never imports `app/`; `initials()` goes to `shared/utils/`; the
  chrome keeps its `app-` file names inside `layout/`; `_components/` keeps its name (the lint
  keys on it); `form/form.tsx` and its test count as already in a folder named for them; the
  constants file is `constant.ts`, his spelling. `consistent-type-definitions` is `interface` in
  `models/*/interface.ts` and `type` elsewhere. `tests/unit/folders.test.ts` enforces the
  `models/` file names and the component folders.
- **Every API call is in `services/<entity>.ts` (C7, the owner's rule 2).** `services/auth.ts`
  holds `login`, `signup` (his name for it; ADR 0013 renames the endpoint to `POST /api/auth/signup`),
  `logout` and `refresh`; `services/user.ts` holds `getMe`, memoised per request, and
  `getProfile`, which the profile page reads instead of taking the session's copy; the
  actions, `core/auth/refresh.ts` and `core/auth/session.ts` called the generated client
  themselves before. Lint lets only `services/` import the generated client's functions;
  `actions/` and `core/` keep its types and `zod.gen`. `getCurrentUser` moved to
  `core/auth/session.ts`, or `services/user.ts` and the session would import each other.
