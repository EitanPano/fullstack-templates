# ADR 0009: Pages, app-wide components and co-located styles in the SPA templates

Status: accepted (Eitan, 2026-11-09, "approved" on this document after the builder check; the four
changes under Context were asked for the same day and the five calls of the session's recap
approved with "yes do that"; built under plan 022). Catalog release `v1.9.0`: `frontend/react` 4.0.0, `frontend/vue`
2.0.0, `frontend/angular` 2.0.0; `frontend/next` unchanged. Harness plan 022. Amends
[ADR 0006](0006-per-framework-frontends-and-angular.md) (A2 the Angular tree, A2.4 styling),
[ADR 0007](0007-react-redux-rtk-scss.md) (R1 the React tree, its styling section, the `src/hooks/`
ruling) and [ADR 0008](0008-vue-pinia.md) (T1 the Vue tree, T5 styling, the `App` prefix). The ten
invariants of `docs/conventions.md › Frontend` name no folder and hold unchanged.
Amended by [ADR 0010](0010-no-chrome-no-example-screen.md) (v1.10.0): C1's app-wide component list (the header, footer and navigation components leave), C3's examples (three leave with the chrome).

## Context

- On 2026-11-09 Eitan asked, for every frontend template: rename `features/` to `pages/`; prefix
  every layout component with `app` (`appHeader`, `appFooter`, `appSideNav`: "the app prefix tells
  it's an app-wide component"), move them into "the components folder" and remove `layout/` once
  empty; put each page's and component's `.scss` next to its `.ts` (`.tsx`, `.vue`), keeping global
  and app-wide style files in `styles/`; and, noting that "the react frontend does not have any
  hooks", make sure each frontend uses its primary features, or at least ships examples of widely
  used ones.
- Today the three single-page templates share one rule from ADR 0006 A2.4: `src/styles/` is the
  only home of CSS. `styles.scss` `@use`s `setup`, `themes`, `basics`, `components` (one partial
  per shared or layout component) and `views` (one partial per screen), in that order; a component
  renders BEM classes and carries no stylesheet. Guard tests assert it (`tests/unit/styles-tree.*`
  in React and Vue, `no-component-styles.spec.ts` in Angular), and so does lint
  (`vue/no-restricted-block` on `<style>`, the React `STYLE` selector, the `styles/**` boundary
  ignore). The trees are
  `app/`, `core/`, `layout/`, `features/<noun>/` (with `pages/` and `components/` inside), `store/`,
  `services/`, `shared/`, `models/`, `styles/`, plus `testing/` in React and Vue.
- What moves: 89 tracked files in React, 80 in Vue, 75 in Angular (`features/`, `layout/`,
  `styles/components/`, `styles/views/`), plus the 20 Vue primitives whose `app-` prefix collides
  with the new meaning of the word. Each template's `AGENTS.md`, ESLint boundaries config,
  boundaries test (47, 44 and 31 lines name `features/` or `layout/`), `template.yaml` `onlyWhen`
  list and `README.md` name the paths. The catalog tools do not: `onlyWhen` is manifest data the
  generator validates against `base/`, markers live inside files, and the e2e suites import only
  `app/nav.ts` and `core/config/constants`. The harness names the tree in two lines
  (`.doc/glossary.md › Actions`, `.claude/skills/writing-plans/template.md › Frontend`).
- `CONTRIBUTING.md › Commits and versioning`: a template's major bumps "when the generated layout
  changes in a way that would move files in an existing project". All three SPAs do; the catalog
  takes a minor, as `v1.7.0` did for React 3.0.0.
- Next is a different shape: the App Router's `app/` with `page.tsx` and `layout.tsx`, the
  `feature/<action>`, `entity/`, `widget/`, `shared/` slices, Tailwind and shadcn, no SCSS. "Pages"
  already means `page.tsx` there, there is no `features/` or `layout/` directory, and its primary
  features are in use (C3). It is out of this ADR, as the session's recap said and Eitan approved.

## Decisions

Each decision lists what it costs. Rows marked ▲ reconcile the request with a framework idiom or a
catalog invariant and are explained beside the mark.

### C1. The tree

One shape for the three SPAs, in each framework's spelling. React, drawn in full (Vue's and
Angular's differences follow):

```
src/
├── main.tsx                          # zod config, the font, themes/brand.css, styles/styles.scss, the app (unchanged)
├── app/                              # wiring only (unchanged): routes.tsx, providers.tsx, nav.ts, root-error.tsx + root-error.scss
├── components/                       # app-wide components ▲: composed by the shells, read the store; never imported by pages/
│   ├── app-main-layout.tsx + .scss   # skip link, <AppHeader>, <main id="main">, <AppFooter>; the nav table stays a prop
│   ├── app-main-loading.tsx + .scss  # the main group's HydrateFallback
│   ├── app-main-error.tsx            # its ErrorBoundary
│   ├── app-auth-layout.tsx + .scss   # (@server:auth) with app-auth-loading.tsx and app-auth-error.tsx
│   ├── app-header.tsx + .scss
│   ├── app-nav-links.tsx
│   ├── app-mobile-nav.tsx + .scss
│   ├── app-footer.tsx + .scss
│   ├── app-theme-menu.tsx
│   ├── app-user-menu.tsx + .scss
│   ├── app-account-slot.tsx          # the generator-resolved slot (two returns; `no-unreachable` off, re-pathed)
│   └── app-account-menu.tsx + .scss  # (@server:auth)
├── pages/                            # one directory per server module or screen group ▲ (was features/)
│   ├── health/
│   │   ├── health.routes.tsx         # healthRoutes(store), unchanged
│   │   ├── health.copy.ts
│   │   ├── home-page.tsx + home-page.scss          # the routed page and its styles (was pages/home-page.tsx + styles/views/_home.scss)
│   │   └── components/               # the module's own presentational pieces, each with its .scss when styled
│   │       ├── system-status.tsx, system-status-skeleton.tsx, health-badge.tsx, refresh-health-button.tsx
│   ├── not-found/                    # not-found.routes.tsx, not-found-page.tsx + .scss
│   ├── auth/                         # (@server:auth) auth.routes.tsx, auth.form.ts, auth.copy.ts, sign-in-page.tsx + .scss,
│   │                                 #   sign-up-page.tsx + .scss, components/sign-in-form.tsx, sign-up-form.tsx
│   ├── user/                         # (@server:auth) user.routes.tsx, profile-page.tsx + .scss, components/profile-card.tsx
│   └── forbidden/                    # (@server:auth) forbidden.routes.tsx, forbidden-page.tsx + .scss
├── core/  store/  services/  models/  testing/     # unchanged (ADR 0007 R1)
├── shared/                           # product-agnostic (unchanged rule)
│   ├── components/                   # one file per component with its styles beside it: button.tsx + button.scss, …;
│   │                                 #   page.tsx + page.scss; controls.scss shared by input.tsx and textarea.tsx; form/ as before
│   ├── hooks/                        # product-agnostic hooks ▲ (new, C3): use-media-query.ts, use-online-status.ts, use-debounced-value.ts
│   └── utils/
└── styles/                           # global and app-wide CSS only
    ├── styles.scss                   # @use setup, themes, basics; no components, no views
    ├── setup/  themes/  basics/      # unchanged (variables, breakpoints, functions, mixins, typography; brand.css, light, dark; helpers, base, layout)
```

- **Vue**: the same tree under `src/`, `.vue` files with a sibling `.scss` (`app-header.vue` +
  `app-header.scss`, `profile-page.vue` + `profile-page.scss`); `components/slots.ts` is the
  generator-resolved file (moved, not renamed; the `no-unreachable` exception re-pathed);
  `components/rtl.spec.ts` moves with the shell it tests; `shared/components/base-*.vue` replaces
  `app-*.vue` (C1.2); `shared/composables/` stays.
- **Angular**: the same tree under `src/app/`, a folder per component as the template already does:
  `components/app-header/app-header.component.{ts,html,scss,spec.ts}`,
  `components/app-main-layout/…`, `pages/health/health.routes.ts`,
  `pages/health/health-status/health-status.component.{ts,html,scss,spec.ts}`,
  `pages/health/components/health-badge/…`, `pages/auth/login/login.component.*`,
  `shared/components/button/button.component.scss` beside its `.ts`. Page component names keep
  their current stems (`LoginComponent`, `HealthStatusComponent`): Angular routes components, the
  folder says "page".

▲ **`components/` is a layer, not `shared/components/`.** `shared/` is product-agnostic by lint
(it imports `shared/` and `models/` only); the header reads the store, the theme and the session,
so it cannot live there. `components/` takes `layout/`'s row in the import table (C1.1) and holds
what `layout/` held: the shells and the pieces they compose. A product adds an app-wide component
here when the shell composes it or it reads the store; a reusable control or pattern goes to
`shared/components/`.

▲ **The shells move too.** `main-layout/` and `auth-layout/` are layout components, so they take
the prefix and the folder like the rest, and `layout/` is deleted rather than kept for two files.
`app/` stays wiring only, so the shells do not move there; the nav table stays a prop (or, in
Angular, the `NAV_ENTRIES` token) because `components/` may not import `app/`.

▲ **`pages/<module>/` is flat.** Renaming only the root would leave `pages/auth/pages/login-page`.
The routed pages sit in the module directory beside its `*.routes`, `*.form` and `*.copy` files;
`components/` is the one sub-directory, for the module's own presentational pieces. Module nouns
keep mirroring the server's modules or a screen group (ADR 0007 R1, ADR 0008 T1); the glossary line
changes its path only.

#### C1.1 Layers and import rules

Each template's table keeps every row and renames two. React (ADR 0007 R1.1):

| From | May import |
| --- | --- |
| `app/` | components (the shells), pages (`*.routes.tsx` only), core, store, shared, models |
| `components/` | core, store, services (the hooks), shared, models; never `app/`, `pages/` or `testing/` |
| `pages/<m>/` | core, store, services (the hooks), shared, models; its own module |
| `pages/<m>/*.form.ts` | shared, models, the generated zod schemas |
| `store/`, `services/`, `core/*`, `shared/`, `models/`, `main.tsx` | as ADR 0007 R1.1 |

Vue (ADR 0008 T1.1) and Angular (ADR 0006 A2.3): `components/` takes the `layout/` row
(`core/config`, `core/providers` (Angular: `core/`), store, shared, models); `pages/<m>/` the
page row (store, shared, models, `core/config`, `core/providers`, `core/guards` in Vue, its own
module's `components/` and `*.form.ts`); `pages/<m>/components/` the feature-components row
(shared, models); `pages/<m>/*.routes.ts` and `*.form.ts` their rows unchanged. `shared/hooks/`
(React) is inside `shared` and inherits its row. The ESLint boundaries elements rename
(`layout` → `components`, `feature` → `page` on `src/pages/*`; Angular's `feature-pages`,
`feature-components`, `feature-routes`, `feature-form` → `page`, `page-components`, `page-routes`,
`page-form`, the `components` sub-folder element listed before the page element so it matches
first); every policy message names the new layer. `boundaries/no-unknown-files` keeps refusing a
directory no layer claims, so `src/hooks/` stays an error: product-agnostic hooks are `shared/`,
hooks over the store are `store/hooks.ts`, a third home is what the rule exists to refuse.

#### C1.2 Names

- **App-wide components** carry the `app-` prefix in every spelling. React: `app-header.tsx`
  exports `AppHeader`. Vue: `app-header.vue`, `<AppHeader>`. Angular: `app-header.component.ts`,
  class `AppHeaderComponent`, selector `app-header` written explicitly (the CLI prefix rule
  `@angular-eslint/component-selector` with `prefix: 'app'` accepts it; the class name is the only
  thing that gains the word, never `app-app-`). `app-side-nav`, `app-footer`, `app-main-layout`,
  `app-auth-layout`, `app-account-menu`, `app-theme-menu`, `app-user-menu`, `app-nav-links`,
  `app-mobile-nav` (React), `app-toast-host`, `app-install-button`, `app-language-toggle` (Vue).
  The React and Vue scans (C2.2) assert that every component file in `components/` starts with
  `app-`; Angular's asserts the folder and class.
- ▲ **Vue's primitives drop the `App` prefix for `Base`.** ADR 0008 gave one-word controls the
  `App` prefix to satisfy `vue/multi-word-component-names`, "Angular's `app-` selector in Vue's
  spelling".
  `App` now means app-wide, so `app-button.vue` becomes `base-button.vue` (`<BaseButton>`), and
  likewise `base-checkbox`, `base-icon`, `base-input`, `base-modal`, `base-select`,
  `base-skeleton`, `base-spinner`, `base-textarea`, `base-toast`: the Vue style guide's other
  sanctioned prefix for base components. Two-word primitives (`auth-card`, `confirm-dialog`,
  `data-table`, `empty-state`, `error-state`, `form-actions`, `form-field`, `page-header`) keep
  their names. The `vue/no-restricted-html-elements` message (`use <App${element}>`) says `Base`.
  Angular's `app-button` selector stays: there `app-` is the CLI prefix on every selector and
  carries no layer meaning; the class is `ButtonComponent`.
- **Pages** keep the `-page` suffix in React and Vue (`home-page.tsx`, `login-page.vue`); Angular
  keeps its component stems. Stylesheets take their owner's stem exactly (`home-page.scss`,
  `app-header.scss`, `button.component.scss`).

### C2. Styles

The rule of ADR 0006 A2.4 splits in two. `src/styles/` holds the global and app-wide CSS:
`styles.scss` (now `@use`ing `setup`, `themes` and `basics` only), `setup/`, `themes/` and
`basics/`, unchanged in content. Every component and page owns a sibling stylesheet with its stem,
referenced by that file alone:

| Framework | The reference | Scope |
| --- | --- | --- |
| React | `import './app-header.scss'` as the component file's last import | global CSS, BEM classes as today |
| Vue | `<style lang="scss" src="./app-header.scss"></style>` with no block body | global, unscoped; `scoped` refused |
| Angular | `styleUrl: './app-header.component.scss'` | emulated encapsulation, the default (C2.1) |

- **What moves where.** `styles/components/_<name>.scss` moves beside the component that renders
  the block: the shared primitives and patterns to `shared/components/`, the shell pieces to
  `components/`, React's `_page.scss` to `shared/components/page.scss`, `_root-error.scss` to
  `app/root-error.scss`, `_main-loading.scss` to `components/app-main-loading.scss`.
  `styles/views/_<view>.scss` moves beside its page (`_profile.scss` →
  `pages/user/profile-page.scss`).
  The `_index.scss` forwarders and their `// @server:auth` markers go: a gated partial now sits in
  a gated directory or is listed itself (C5). The underscore prefix goes with them: a sibling file
  is an entry, not a partial.
- ▲ **A partial two components share** stays one file in their directory, referenced by each
  (`shared/components/controls.scss` by `input.tsx` and `textarea.tsx`; Angular lists it in
  `styleUrls` beside the component's own). Vite loads a module once; Angular bundles it per
  component, encapsulated, which is the price of not duplicating the source.
- **Each sibling file `@use`s what it needs** from `setup/` (`@use 'setup/functions'`,
  `'setup/mixins'`, `'setup/breakpoints'`, `'setup/variables'`): Vite's `loadPaths` and
  Angular's `includePaths` already point at `src/styles`, so no relative climb. `setup/` emits
  no CSS, so a repeated `@use` costs nothing. `themes/` and `basics/` are never `@use`d by a
  sibling: they are loaded once by `styles.scss` and reached through custom properties.
- **The cascade.** `main.tsx` (`main.ts`, `angular.json`) loads `brand.css` and `styles.scss`
  first, as today (`main-imports.test.ts` unchanged); a component's sheet lands in the chunk that
  imports it, so a lazy route carries its page's CSS and the initial stylesheet shrinks. Between a
  page class and a component class, specificity decides, as BEM intends; the old `components`-then-
  `views` order was never relied on by a selector (S1 verifies the production build).
- **The lint.** React's `STYLE` selector keeps refusing the `style` attribute, its message now
  "add a class to the component's stylesheet"; the import ban on `.scss` goes (the scan takes over,
  since a lint rule cannot compare an import with the importing file's stem). Vue drops
  `vue/no-restricted-block` for `style` and extends `vue/block-lang` to
  `{ script: { lang: 'ts' }, style: { lang: 'scss' } }`; `vue/no-static-inline-styles` stays.
  Angular's `component-selector` rule is unchanged.
- **Class names** stay BEM and stay the same strings: the rubric names of the `ui-design` skill,
  the e2e selectors and the screens checks see no difference.

#### C2.1 Angular encapsulation

Angular's component styles are the framework's primary styling feature, so the moved partials run
under the default emulated encapsulation; `ViewEncapsulation.None` and `::ng-deep` are refused by
the scan. The audit of today's partials found seven selectors that cross a component boundary,
and the rules that fix them:

| Today | Under encapsulation | Becomes |
| --- | --- | --- |
| `app-button { … }` in `_button.scss`, `app-data-table { … }` in `_data-table.scss` | a component's own host | `:host { … }` |
| `.auth-layout app-footer { … }` | a parent styling a child's host element, which is in the parent's template | stays as written |
| `.form-actions .button { … }`, `.header .button { … }` | a parent reaching into a child's interior | the parent styles the child's host (`app-button { inline-size: 100% }`, the button filling its host), or the button takes an input (`block`) when the host box is not enough |
| `app-checkbox { … }` in `_form-field.scss` | projected content: the form field's styles never reach it | the rule moves to the checkbox's own sheet, under `:host-context(.form-field)` when it depends on the parent |

A page never restyles a shared component's interior; it uses the component's inputs. S2 proves the
pair that matters most (`app-header` with `app-button`) before the build; the e2e `screens.spec`
in both themes and `shell.spec` are the proof after it.

#### C2.2 The scans

The guard tests flip from "no CSS outside `styles/`" to "every stylesheet has its owner":

- `tests/unit/styles-tree.test.ts` (React), `styles-tree.spec.ts` (Vue),
  `component-styles.spec.ts` (Angular, renamed from `no-component-styles`): `src/styles/` holds
  only `styles.scss`, `setup/`, `themes/`, `basics/`; every `.scss` outside it has a sibling
  component file with the same stem that references it (or is a directory-shared partial
  referenced by two or more siblings); every stylesheet reference points at a sibling; no
  `style={}` / `:style` (React, Vue), no `scoped` and no `<style>` body (Vue), no `styles:`,
  `ViewEncapsulation.None` or `::ng-deep` (Angular); every component file in `components/`
  carries the `app-` prefix: React's `.tsx` files other than `*.test.tsx`, Vue's `.vue` files,
  Angular's sub-folders with their `*.component.ts` class carrying `App`. Non-component files are
  exempt (Vue's `slots.ts`, the specs, the `.scss` siblings, which follow their owner's stem).
- `density.test.ts` (`.spec.ts`) compiles `styles.scss` plus every `.scss` outside `styles/`
  (the controls' sheet is where the sizing contract now lives); `rtl-styles.spec.ts` (Vue) scans
  the same set. Each keeps asserting the same numbers and the same logical-property rule.
- The boundaries tests re-path their fixtures and keep one violation and one allowed case per
  rule (invariant 8).

### C3. Primary features

What each framework is for, used where the template already does the work by hand or lacks a
parity feature; nothing added for show (invariant 10: a template never ships placeholder code).

- **React** gains `shared/hooks/`, product-agnostic and tested:
  `use-media-query.ts` (`useMediaQuery(query)` on `useSyncExternalStore` over `matchMedia`;
  `app-mobile-nav` closes its sheet when the viewport reaches `md`, as Vue's drawer does, instead of
  staying open as a modal once its trigger is hidden; `core/theme/theme.ts` keeps its own
  `matchMedia`, it runs before React); `use-online-status.ts` (`useOnlineStatus()` on
  `useSyncExternalStore` over `online`/`offline`; `app-header` shows the offline badge Angular's
  and Vue's headers already
  show); `use-debounced-value.ts` (`useDebouncedValue(value, ms)`, the one example without a
  caller in the template, named as such in `AGENTS.md`). Hooks over the store stay in
  `store/hooks.ts`. Already in use and now listed under `AGENTS.md › Adding a feature`: `useId`,
  React 19's `<title>` in a page, lazy route modules, error boundaries, RTK Query's generated hooks.
  ▲ Not added: `useTransition`, `useDeferredValue`, `useOptimistic`, `memo`: the template has no
  expensive render to defer and RTK Query owns optimism; the session's recap proposed
  `useTransition` on the refresh and sign-in handlers, and the audit found it would only duplicate
  the mutations' `isLoading`.
- **Vue** is idiomatic already (`<script setup>`, six composables, `defineModel`, `provide/inject`,
  `useTemplateRef`, `watchEffect`, `shallowRef`, Pinia setup stores, custom directives). It gains
  `<TransitionGroup>` on the toast host's list (enter and leave classes in `app-toast-host.scss`,
  `prefers-reduced-motion` honoured in CSS) and `<Transition>` on the header's offline badge.
  Not added: `<Teleport>` (Reka's portals already), `defineAsyncComponent` (routes are lazy),
  `<KeepAlive>`, `<Suspense>` (experimental).
- **Angular** is strong on signals, `input`/`output`, `viewChild`/`contentChild`, `@if`/`@for`,
  OnPush, `signalStore`, `toSignal`, `afterNextRender`. It gains `model()` on `app-side-nav`'s
  `open` (`[(open)]` in `app-main-layout`, replacing `input(false)` plus the `closed` output),
  one `@defer (on idle)` block around the toast outlet in `app-main-layout` (a real chunk, no
  landmark deferred), and `linkedSignal` where a component keeps local state that must reset when
  an input changes (the select's highlighted option is the candidate; if the builder finds no such
  state, none is added and the report says so). `AGENTS.md` states that the app is zoneless
  (Angular 21+ default, no `zone.js` polyfill, no `provideZoneChangeDetection`). Not added:
  `resource`/`httpResource` (stable since 22.0, but the data path is page → store → service →
  SDK and stays one path), Signal Forms (ADR 0006).
- **Next** is unchanged. Its primary features are in use: `'use server'`, `'use client'`,
  `'use cache'` with `cacheTag`/`cacheLife`, `updateTag`, `Suspense`, `loading.tsx`/`error.tsx`
  per group, `proxy.ts`, `connection()`, `cookies()`/`headers()`, `redirect`/`notFound`,
  `next/image`, static `metadata` on every page. The session's recap said no page had metadata;
  the audit found `export const metadata` on all five, so neither `generateMetadata` nor a version
  bump is warranted. `useActionState`/`useFormStatus` would be a second forms pattern beside
  `useHookFormAction`.

### C4. Tests and e2e

Co-located specs move with their files. The three scans are rewritten (C2.2), the three
boundaries tests re-pathed, `main-imports` unchanged. The e2e suites import `app/nav.ts` and
`core/config/constants`, both unmoved; `tests/cases.yaml` names no source path; the screens checks
read routes and class names, both unchanged. New unit tests: each React hook (happy path and the
unsubscribe or empty case), the Vue toast transition (the list renders and removes), the Angular
`model()` binding and the `@defer` block (`@placeholder` renders, content after idle, with
`DeferBlockBehavior`). The proof is each template's `check` and e2e in a generated project per
stack, as plan 021's cases did.

### C5. Manifests, agents files, docs, release

- `template.yaml` `onlyWhen` re-pathed: React `src/features/{auth,forbidden,user}` →
  `src/pages/…`, `src/layout/auth-layout` → the `app-auth-layout*` files, `account-menu` → the
  `app-account-menu` files and sheet, the three `styles/components/_*.scss` entries → the siblings
  they became; Vue and Angular likewise, their `styles/views/_*.scss` entries → the pages'
  directories already listed. The generator validates every path exists in `base/`.
- `index.yaml`: versions 4.0.0, 2.0.0, 2.0.0; the three summaries say "co-located SCSS on a global
  token tree" where they say "global SCSS tree". `README.md`'s table follows. `CONTRIBUTING.md`
  lines that describe a new primitive as "a partial in `src/styles/components/` forwarded by its
  `_index.scss`" (the React and Vue refresh sections) and the three "global SCSS tree" phrases.
- Each SPA's `AGENTS.md`, rewritten in place: the layer list and `Where does X go` (`pages/`,
  `components/`, `shared/hooks/`, "a stylesheet: beside its component"), the import table, the
  `Adding a feature` recipe (the styles step becomes "a sibling `.scss` with the page's stem"),
  `Styling` (the two homes, the reference form, encapsulation in Angular, the `Base` prefix in
  Vue), `Tests` (the scans). The five checked headings stay. Each template's `README.md` tree.
- Each `CHANGELOG.md` opens with a `### Breaking` move table (today's path → the new path) so a
  project on 3.0.0 / 1.0.0 / 1.0.0 can move by hand; there is no migration tool, and the harness's
  update command touches harness files only.
- Catalog `v1.9.0`, a minor: three template majors, no tool or schema change. No new dependency
  is expected; S3 says whether `eslint-plugin-vue`'s `block-lang` covers `style` at the pinned
  version.

### C6. The harness

| File | Today | Becomes |
| --- | --- | --- |
| `.doc/glossary.md › Actions` | "React, Angular and Vue features mirror the server's modules or a screen group (`features/<noun>`)" | "… (`pages/<noun>`)" |
| `.claude/skills/writing-plans/template.md › Frontend` | "nav entry, view partial" twice | "nav entry, the page's stylesheet" |
| `.claude/README.md › Frontend choice` | "Angular arrived in catalog v1.6.0, React's structure (Redux Toolkit, RTK Query and the global SCSS tree) in v1.7.0 and Vue in v1.8.0" | "… in v1.7.0, Vue in v1.8.0, and v1.9.0 moved the three SPA trees to `pages/` and `components/` with co-located styles" |
| `catalog.lock` | v1.8.0 | v1.9.0, its own pull request after the release |

The `ui-design`, `writing-tests`, `code-review`, `error-handling` and `dev-loop` texts name no
folder and need nothing; `scripts/docs.test.mjs` caps the size-limited files.

## Decisions made while building

Where the code as built differs from the text above, this section wins. Each item was checked
against `frontend/react/base`, `frontend/vue/base` and `frontend/angular/base`.

- **The cascade: layers, not "styles.scss first" (spike S1 failed; ruling R6).** S1 expected
  `styles.scss` to be the first stylesheet the page links. Vite emits a component imported by the
  entry and by a lazy route as its own chunk and links that chunk's CSS before the entry's, so a
  shared component's sheet comes first. The global tree is therefore wrapped in cascade layers:
  `setup/_layers.scss` declares `@layer setup, themes, basics;` and is the first `@use` of
  `styles.scss`, and the rules of every global partial sit in their layer. Sibling sheets are
  never layered, so a basics rule can no longer beat a component rule by specificity. No rule
  needed to at 1.x (the four that did, the compact `.container` and `.main`, `main:focus` and
  `.skip-link:focus`, have no conflicting sibling rule), so rendering is unchanged. `brand.css`
  shares no property name with the themes, so the generated tokens keep their precedence. Spike S1b proved it (entry CSS layered, `density` 11/11 on the new compile set
  with no regex changed, React screenshots pristine against layered equal outside the live uptime
  digits); the scans assert the declaration and refuse `@layer` in a sibling. The paragraph under
  C2 "The cascade" is amended by this item. Cost: one more concept in the global tree; the wrappers
  and one scan assertion come out in one commit if another remedy is preferred.
- **Specs follow their owner's stem (ruling R1).** When an owner is renamed its spec is renamed
  with it (`header.test.tsx` becomes `app-header.test.tsx`), so a sibling spec never has another
  stem than its owner; describe and it titles are unchanged, so no test is deleted by title. Cost:
  one rename per spec in the diff.
- **A sheet exists only when rules exist.** React's `_sign-in.scss` and `_sign-up.scss` held only a
  comment, so `sign-in-page.scss` and `sign-up-page.scss` were not created and those pages import
  nothing; a product that adds rules adds the sibling and the scan then requires the import. The
  Vue report records no comment-only partial, so no sheet was dropped there.
- **`.icon` and `.nav-links`.** `.icon` and `.icon--lg` had about 17 users in React and no single
  owner, so they fold into `basics/_helpers.scss` (layered; component rules beat them at any
  specificity). In Vue `base-icon.scss` owns `.icon`, since only `base-icon.vue` renders it, and
  in Angular `icon.component.scss` does. React's `.nav-links` rules live in `app-header.scss`, the
  header composing the links; the block keeps its class.
- **Sheets split by renderer, or shared by several.** Where a partial held blocks rendered by
  different components it was split: Vue's `_toast` into `app-toast-host.scss` (the viewport) and
  `base-toast.scss`, and `_health-status` into the page's sheet and `health-badge.scss`; Angular's
  `_controls`, `_modal` and `_health-status` gave `checkbox`, `confirm-dialog` and `health-badge`
  their own sheets. Where several components render parts of one block they reference one sheet:
  Vue's `controls.scss` from four inputs and `base-modal.scss` from `base-modal` and
  `confirm-dialog`; React's `controls.scss` from `input.tsx` and `textarea.tsx` (`select.tsx` has
  its own). In React `_form-field.scss` became `field-frame.scss` and `_toast.scss` `toaster.scss`,
  named for their owners with the classes unchanged.
- **Angular `@defer`: none (ruling R4).** C3 put `@defer (on idle)` around the toast outlet in
  `app-main-layout`, but the toast is a CDK overlay portal attached by `NotificationService`, so
  the shell has no outlet to wrap, and every other shell element is a landmark or flag-gated.
  The agents file names `@defer` with the rule "a non-landmark block whose first paint can wait"
  and records that the template has none; adding one for show would break invariant 10. Cost: a
  follow-up if a `@defer` example is wanted regardless.
- **`linkedSignal`: none.** No Angular component keeps local state that must reset when an input
  changes (the select is a native `<select>`; `input`'s `revealed`, `form-field`'s `tick` and
  `submitted` and the toast's DOM flags are not input-derived), so there is no spot and no spec;
  the agents file records the absence.
- **Angular encapsulation beyond the C2.1 table (S2 and the C3 report).** The user-menu panel's
  buttons needed a `block` input on `ButtonComponent` (`.button--block`): the
  `.user-menu__panel .button` reach is dead under encapsulation and a host-only rule left the
  label centred. A parent's class on an `app-*` host beats the child's `:host { display: contents }`
  only once both sheets are encapsulated (class plus attribute against the host attribute alone):
  `.side-nav__close` lost to the button's `:host` while the side nav's partial was still global,
  hence every partial moved and none stayed behind. Of the cross-boundary selectors, the own-host
  rules (`app-button`, `app-data-table`, the form controls) became `:host`; the rules by which a
  parent places a child's host (`.header__*`, `.side-nav__close`, `.auth-layout app-footer`) stay
  in the parent's encapsulated sheet; two interior reaches (`.user-menu__panel .button` and the
  redundant `.form-actions .button` widths) were removed; nothing needed `ViewEncapsulation.None`
  or `::ng-deep`, and the scan refuses both.
- **Angular, the CDK overlay's pane and backdrop (ruling R8).** `.modal__panel*` and
  `.modal__backdrop` are created by the CDK outside every view, so they have no owning component:
  their rules stay in the global tree (`basics/_layout.scss`, inside `@layer basics`) and reach
  the elements through the service's `panelClass` and `backdropClass`, with no inline style from a
  service and no `:host-context` sizing. `@include cdk.overlay()` is dropped from the toast sheet:
  the CDK loads its own overlay CSS when the first overlay opens. A browser check showed the pane
  and backdrop identical to 1.0.0 in four views. The 90dvh cap on the pane is dead in 1.0.0 and
  2.0.0 alike, the CDK's unlayered `max-height: 100%` winning.
- **Angular lint and tests.** `boundaries/no-unknown-files` is new in the Angular lint (specs,
  `main.ts` and `environments/` ignored), so `src/app/layout/` and `src/app/features/` are refused
  as unknown files. The page element is `src/app/pages/*/*`, with the `page-components` element
  `pages/*/components` listed first; a new sibling folder under `pages/` therefore reads as a
  page, which the agents file states. Angular has no compile-based `density` test; the e2e
  `shell.spec` asserts the 44/36/32 px sizing contract.
- **Vue `<TransitionGroup>`: none (ruling R7).** Reka's `ToastRoot` teleports each toast's `<li>`
  into the viewport's `<ol>`, so a `<TransitionGroup>` around the `BaseToast` list has only a
  Teleport as each child's root; Vue warns "renders non-element root node that cannot be
  animated" and the `toast-enter-active` and `toast-leave-active` specs stay red. A leave
  animation would need a delayed store removal, a hand-rolled timer in a template (invariant 10).
  The header's offline badge in a `<Transition>`, with `prefers-reduced-motion` honoured in
  `app-header.scss`, is the Vue transition example; Reka's toasts animate through their own
  `data-state` keyframes in `base-toast.scss`. Cost: a follow-up if a `<TransitionGroup>` example
  is wanted on another list.
- **Vue tooling.** `vue/block-lang` takes `{ script: { lang: 'ts' }, style: { lang: 'scss' } }` (S3: it checks `lang`
  only, accepts the empty `<style lang="scss" src>` block and flags a lang-less `<style>`), so
  `vue/no-restricted-block` for `style` is dropped. The page element's `fileInternalPath` is
  `*.vue`, so a non-page `.ts` directly in `src/pages/<module>/`, other than routes and forms, is
  unconstrained.
- **React.** The sheet closes at `md` by adjusting state during render (`if (atMd && open)
  setOpen(false)`), because the `react-hooks/set-state-in-effect` rule refuses the effect form;
  the behaviour is the same, with no frame of the open sheet. The offline badge reuses the shared
  `Badge` with `variant="warning"`, so `badge.scss` is in the bundle on every route.
  `useMediaQuery` wraps `subscribe` and `getSnapshot` in `useCallback` keyed on `query` (a review
  round: an inline arrow resubscribed on every render).
- **The scans, tightened in React and copied.** React's styles-tree scan requires the owner's
  sibling import to be the owner's last import and every top-level statement of a global partial
  to be a `@use`, a comment or the one `@layer` block. Vue's scan takes the same shape (its
  sibling `<style>` block must be the last block, and it refuses a layered sibling and a stray
  rule in a partial); Angular's refuses `ViewEncapsulation.None`, `::ng-deep`, an unprefixed
  app-wide component and a layered component sheet (a component sheet may not use `@layer`).
- **Release hygiene.** Vue's manifest sort reordered `postGenerate` and was restored in its own
  commit. The intermediate commits of the three template tasks are not individually green (the
  lint config is re-pathed in a later commit); the merged tree is.

## Alternatives considered

- **CSS modules in React, `scoped` in Vue.** Real scoping, but hashed or attribute-qualified class
  names break the one BEM vocabulary the three SPAs share with the `ui-design` rubric and the
  screens checks, and every selector would be rewritten. Rejected; BEM is the scoping.
- **`ViewEncapsulation.None` in Angular** to keep the partials byte-identical. Rejected: it throws
  away the framework's primary styling feature and lets a page leak into components; the audit
  found seven selectors to fix, not seventy.
- **Keep `styles/components/` for the shared primitives only.** Two homes for component CSS, and
  the request says beside the component. Rejected.
- **The shells into `app/`.** `app/` only wires; the shells would then import `nav.ts` directly and
  the layer map would gain an exception. Rejected; they are app-wide components.
- **`shared/components/` as the home of the app-wide components.** `shared/` is product-agnostic
  by lint; the header reads the store. Rejected.
- **A top-level `src/hooks/`.** Hooks over the store already live in `store/hooks.ts`; a third
  home is what `no-unknown-files` refuses. `shared/hooks/` keeps the product-agnostic rule.
- **`useTransition` and `useDeferredValue` for show; `resource`/`httpResource`; `generateMetadata`
  in Next.** Placeholder code, a second data path, and a feature already present. Rejected (C3).
- **Next on this ADR.** No `features/`, `layout/` or SCSS to move; "page" is `page.tsx`. Out.

## Consequences

- Three template majors; a project generated before `v1.9.0` moves by hand with the changelog's
  table (every move is a rename; the import paths and the stylesheet references are the edits).
- A page's CSS ships in its route chunk; the initial stylesheet carries tokens, base and layout
  only. A component and its styles are created, moved and deleted together.
- In Angular a page can no longer restyle a shared component's interior: it uses the component's
  inputs, which is the encapsulation working.
- The three agents files describe the same shape with the same words (`pages/`, `components/`,
  `shared/`, "the page's stylesheet"), so the dev loop's recipe changes one step in each.
- Vue's primitives are `Base*`; a product written against `AppButton` renames on upgrade.
- The harness changes two lines and a lock.

## Out of scope

Next's tree and styling (Tailwind stays; the "Next on the SCSS tree" follow-up named by ADR 0007
and ADR 0008 stays open and is now "Next on co-located SCSS"). Migration tooling for generated
projects. Signal Forms, `httpResource`, Pinia Colada, Vue 3.6. A storybook or component catalog.
Renaming the harness's "feature" vocabulary (`Adding a feature`, the `frontend` agent's steps):
a feature is still what a plan adds; `pages/` is where its screens live.

## Spikes (throwaway, in the session's scratch folder, before the plan's build steps)

- **S1. Vite CSS order and chunking.** In a copy of `frontend/react/base`, move one page's view
  partial and one shared component's partial beside their owners, build, and inspect
  `dist/assets`: the entry CSS holds setup, themes and basics; the lazy route's chunk carries the
  page CSS; the rendered order places `styles.scss` first. Repeat for Vue with `<style src>`.
- **S2. Angular encapsulation on the header and the button.** Move `_header.scss` and
  `_button.scss` beside their components with `styleUrl`, apply the C2.1 fixes, `ng build`, and
  check the header in both themes at `phone` and `desktop`; record which of the seven selectors
  needed which fix.
- **S3. Vue tooling on `<style src>`.** `vue-tsc`, `eslint-plugin-vue` (`block-lang` for `style` at
  the pinned version, or the scan alone), `@vitejs/plugin-vue` and Vitest with a sibling `.scss`;
  record what each accepts.

A spike that fails its check is a stop, not a fork: the builder reports the evidence to Eitan and
the plan waits. The rejected alternatives (`ViewEncapsulation.None`, the partials staying in
`styles/`, `scoped` in Vue) are not fallbacks the builder may take alone.

## Left to the builder

The exact BEM block names where a moved partial's block no longer matches its owner's stem (keep
the class, name the file by the owner); the `controls.scss` split if the select trigger needs a
share; the three hooks' signatures beyond C3; the `linkedSignal` spot or its absence; the
`@defer` test's `DeferBlockBehavior`; the boundaries fixtures; the `AGENTS.md` and `README.md`
text; the changelog move tables; the `index.yaml` summaries' wording.

## Versions (registry, 2026-11-09; re-verified at build from each `node_modules/<pkg>/package.json`)

No new dependency. As built: React 19.3.0, Vite 8.3.6 and Vitest 5.1.0 (React and Vue); Vue
3.5.44 with vue-tsc 3.3.14, `eslint-plugin-vue` 10.12.0 and `@vitejs/plugin-vue` 6.0.10; Angular
(`@angular/core`) 22.2.4 with `@angular/build` and the CLI at 22.2.6 and TypeScript 6.0.3. The
APIs used are in the pinned frameworks: `useSyncExternalStore` and `<title>` (React),
`<Transition>` (Vue; `<TransitionGroup>` is not used, see above), `model` stable since 19.0 and
zoneless default since 21 (Angular). S3's answer: `eslint-plugin-vue` 10.12.0's `block-lang`
covers the `style` block, with no scan fallback needed for the empty `src` block.
