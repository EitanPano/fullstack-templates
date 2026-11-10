# ADR 0010: No template chrome, no example screen

Status: accepted (Eitan, 2026-11-10: "accept the ADR"). D1 and D3 are his rulings of the same
day; the rows marked ▲ are the session's, listed to him before he accepted. Not built yet:
harness plan 023 builds it once he sets that plan to active. Catalog release `v1.10.0`: `frontend/next` 3.0.0, `frontend/react` 5.0.0, `frontend/vue`
3.0.0, `frontend/angular` 3.0.0; the servers and the tools are unchanged. Amends
[ADR 0004](0004-ui-baseline.md) (U1 the shell, U4 what `shell.spec` asserts),
[ADR 0006](0006-per-framework-frontends-and-angular.md) (invariants 4, 6, 7, 8 and 10) and
[ADR 0009](0009-pages-components-colocated-styles.md) (C1's app-wide component list, C3's examples).

## Context

- A project generated from `next-bun-express` at v1.9.0 for a brief that said "closely mirror
  Trello" shipped the template's header (the display name, `Boards / Status`), its footer bar
  and the health screen as `/status` (the harness comparison run of 2026-11-10). Eitan, the same
  day: every project "uses a template header element … always the same ugly static style"; the
  footer should not exist; "health-check frontend templates ui should never be added, only if
  both a server exists … and the user wants to create an indicator".
- Why it shipped. Invariant 4 requires `<header>`, a nav built from the nav table and
  `<footer>`. Each template's `shell.spec` and shell unit tests assert the `banner` and
  `contentinfo` landmarks. Each agents file calls the health files "the worked example", and
  `smoke.spec` and `shell.spec` anchor on its `Refresh` button, so the session moved the screen
  instead of removing it.
- `main` carries the page width (Next: `max-w-5xl` in `app-shell.tsx`; the SPAs: `.main` in
  `styles/basics/_layout.scss`), so that run needed a `wide` prop to lay out a board.
- `CONTRIBUTING.md › Commits and versioning`: a template's major bumps when the generated
  layout changes in a way that would move files in an existing project. All four do.

## Decisions

### D1. The skeleton

A main layout renders, in this order: the skip link (first in the tab order, it focuses `main`),
the one `<main id="main" tabindex="-1">` with the route outlet, and the toast outlet the template
already has. It renders no `<header>`, `<nav>` or `<footer>` and no brand text. Header,
navigation and footer are product code, built by the first frontend task from the brief.

- ▲ **`main` has no width and no padding.** The page pattern component (`Page` in Next and
  React, its equivalent in Vue and Angular) owns the container width and the gutters, so a
  full-bleed screen (a board, an editor) fills the viewport without a layout prop. The auth
  layout is unchanged.
- `app/nav.ts` stays: the one table of top-level routes, read by `screens.spec` and by the
  navigation a product builds. It keeps its `Home` entry.

| Template | Deleted | Rewritten |
| --- | --- | --- |
| next | `src/shared/ui/pattern/{app-shell,mobile-nav,nav-links}.tsx`, `tests/unit/app-shell.test.tsx` | `src/app/(site)/layout.tsx` (skip link + `main`); new `src/shared/ui/pattern/skip-link.tsx` |
| react | `src/components/app-{header,footer,nav-links,mobile-nav,account-slot}.*` | `src/components/app-main-layout.tsx` (no `nav` prop), its test, `src/app/routes.tsx` |
| vue | `src/components/app-{header,footer,side-nav,nav-links}.*`, `slots.ts`, `slots.spec.ts` | `src/components/app-main-layout.vue` (no `nav` prop, no drawer), its spec, `src/app/routes.ts` |
| angular | `src/app/components/app-{header,footer,side-nav}/` | `src/app/components/app-main-layout/` |

### D2. Components the product places

Kept, unit-tested and rendered by no template file; the product's shell imports them.

| Template | Always | With `server:auth` | With `i18n` / `pwa` |
| --- | --- | --- | --- |
| next | `pattern/theme-toggle.tsx`, `pattern/user-menu.tsx` | `widget/account-menu/` | n/a |
| react | `app-theme-menu`, `app-user-menu` | `app-account-menu` | n/a |
| vue | `app-theme-toggle` (new, from the header's theme cycle) | `app-account-menu` | `app-language-toggle` / `app-install-button` |
| angular | `app-theme-toggle/` (new) | `app-account-menu/` (new) | `app-language-toggle/` / `app-install-button/` with the iOS hint (new) |

- Angular's four are extracted from `app-header.component.html`, each with the marker block it
  had there turned into an `onlyPaths` or `onlyWhen` entry.
- ▲ **No account slot.** React's `app-account-slot.tsx` and Vue's `slots.ts` resolved which
  menu a header shows; with no header they have no caller. The product imports the concrete
  component, and a plan that adds auth later names the swap. Cost: that swap is a product edit.

### D3. No example screen

| Template | Deleted |
| --- | --- |
| next | `src/entity/health/`, `src/feature/refresh-health/`, `src/widget/system-status/`, their five unit tests |
| react | `src/pages/health/`, `src/services/health.api{,.test}.ts`, `src/models/health.ts` |
| vue | `src/pages/health/`, `src/services/health.service.*`, `src/store/health.store.*`, `src/models/health/`, the `health.*`, `shell.*` and `nav.open`/`nav.close` keys, the Workbox `api-health` runtime cache |
| angular | the same set under `src/app/`, the `ngsw-config.json` `api` data group |

- **The index route** renders the display name as its one `h1` through the page pattern, and
  one line of copy ("Replace this page with the first screen."). No data call. Next keeps
  `(site)/page.tsx`; the SPAs get `pages/home/` with its route file, page and stylesheet.
- The servers keep `/api/health` and `/api/health/ready`: they are the deploy probes.
- An indicator of the server's health is product work, built by plan when a server exists and
  the user asks for one.
- ▲ **The recipe replaces the worked example.** Under `Adding a feature`, each agents file
  shows each step as a short code block (a read, a mutation, a page) instead of pointing at
  health files. Invariant 10 already says the recipe is documentation.
- ▲ **Three of ADR 0009 C3's examples leave with the chrome**: `<Transition>` on Vue's offline
  badge, `model()` on Angular's drawer, and the callers of React's `use-online-status` and
  `use-media-query` (the hooks stay, tested). An example needs a screen, and this ADR forbids
  example screens.

### D4. Sign out without a header (`server:auth` only)

The profile page carries a Sign out button in all four templates: Vue and Angular already have
one; Next and React gain one that runs the menu item's action. The e2e helper `signOutThroughUi`
goes to `/profile` and clicks it, and `auth.spec` reads the signed-in state there instead of
from the header's account menu.

### D5. Tests

No assertion is dropped without a successor; each changelog lists the pairs.

| Suite | Asserts after this ADR |
| --- | --- |
| `shell.spec` | the skip link is first in the tab order and focuses `main`; exactly one `main`, with id `main`; no horizontal overflow on `/` and an unknown URL; the 404 renders inside `main`; `@phone`: every visible control on the 404 is at least 44 px, also at compact density; `@desktop`: its home control is 36 px, 32 px compact |
| `smoke.spec` | the index route has one `h1` inside `main` and passes axe. SPAs only: `GET /api/health` on the page's origin answers 200 (invariant 2's proxy proof, a request, not UI) |
| `screens.spec` | unchanged |
| unit | the main layout (skip link first, one `main`); each D2 component; the profile Sign out |

- Gone: the `banner`, `contentinfo` and Primary-nav assertions, the phone menu, the theme-menu
  e2e (successors: the theme unit tests and `screens.spec`'s two-theme capture) and every
  `Refresh` anchor.
- Next's `tests/unit/use-cache.test.ts` asserted that a cached loader exists; the health loader
  was the only one. It tests the directive rule over seeded sources instead.

### D6. Documents

- `docs/conventions.md › Frontend`:
  - 4 becomes: "**Shell** (ADR 0010; amends ADR 0004 U1). A skip link to `#main`, first in the
    tab order, and the page's one `<main id="main">`; nothing else. Header, navigation, footer
    and the places of the theme toggle and the account menu are product code. `app/nav.ts` is
    the one table of top-level routes."
  - 6: "a theme toggle in the shell (…)" becomes "a theme toggle component the product places".
  - 7: "a user menu … the theme toggle sits in the shell …" becomes "an account menu component
    the product places, and Sign out on the profile page".
  - 8: `shell.spec` is "(skip link, one `main`, overflow, targets)".
  - 10 adds: "nor an example screen: the index route is one `h1` and one line of copy".
- `CONTRIBUTING.md`: the frontend checklist's "the shell landmarks built from one nav table" and
  "the shell nav" glue test; the release paragraph.
- Each `AGENTS.md`: the layer list and `Styling` lose the shell components and name the D2
  ones; `Adding a feature` gains D3's code blocks and one paragraph, "The shell": where the
  product's chrome goes (the template's app-wide component home) and that it sits between the
  skip link and `main`. The five checked headings stay.
- Each `README.md` tree; each `CHANGELOG.md` with a `### Breaking` table; one "amended by
  ADR 0010" line in ADR 0004 (U1, U4), ADR 0006 (the invariants) and ADR 0009 (C1, C3).

### D7. Release

Four template majors; catalog `v1.10.0`, a minor. `schemaVersion` stays 1. No tool change, no new
dependency, no new case: every existing case passes with `--e2e`.

### D8. The harness (plan 023)

| File | Today | Becomes |
| --- | --- | --- |
| `.claude/rules/ui-and-styling.md` | the shell is `<header>`, `<nav>`, `<main>`, `<footer>` | the template's shell is a skip link and `main`; chrome is product code built as the plan's `shell` line says |
| `.claude/skills/ui-design/SKILL.md` | Reference apps listed, unused; no full-bleed pattern | a `Shell` section driven by Reference apps; a `workspace` pattern; rubric check 7 judges the shell against the plan |
| `.claude/skills/writing-plans/` | `UX` is one line per route | the first frontend task's `UX` opens with a `shell` line |
| `.claude/skills/bootstrap-project/SKILL.md` | the dev check opens "the health screen" | the home page renders |
| `catalog.lock` | v1.9.0 | v1.10.0, its own pull request after the release |

## Alternatives considered

- **A neutral header (brand and slots, no footer).** Every project still starts from the same
  header. Rejected by Eitan.
- **Keep the shell and tell agents to redesign it.** It relies on an agent overriding template
  code and the template tests that assert the old shell. Rejected by Eitan.
- **A `shell` flag.** The same chrome when on, and a second case per template. Rejected.
- **The health screen behind `onlyWhen: server`.** Still an example screen in every project
  that has a server. Rejected (D3).
- **Keep the account slots** so a later auth part appears in the product's header by itself.
  A generator-resolved switch with one caller the template no longer owns. Rejected (D2).

## Consequences

- A generated app is one page with an `h1` until the first frontend task. With auth, a
  signed-in user reaches `/profile` by URL until the product's shell places the account menu.
- Four template majors. A project generated before `v1.10.0` keeps its shell and status page
  as product code; removing them is ordinary work by plan. There is no migration tool.
- The harness decides the chrome per product; without that decision (plan 023) an app would
  have none.
- ADR 0009 C3 loses three examples (D3).

## Out of scope

A frontend generated without a server (ADR 0011). Next's tree and styling (ADR 0012). The server
templates. A component catalog.

## Spike (throwaway, in the session's scratch folder, before the build)

- **S0. Extraction and the container.** In generated `vue/default` and `angular/default`
  projects, extract the theme toggle (and Angular's language toggle, install button and account
  menu) from the header: `vue-tsc -b` and `ng build` are green and each renders and behaves as
  in the 2.0.0 header. In all four, move the container from `main` to the page pattern: the
  404, profile and forbidden screens render as their 2.x screenshots at `phone` and `desktop`.

A failed spike is a stop that returns to Eitan with its evidence, never a fallback taken alone.

## Left to the builder

The index route's copy line; the extracted components' selectors and class names; which i18n
keys leave with the chrome; the agents files' code blocks and wording; the changelog tables; the
`index.yaml` summaries.

## Decisions made while building

Where the code as built differs from the text above, this section wins. Each is a ruling of the
build session (harness plan 023), recorded before the template it concerns was built.

- **Vue and Angular gain a page pattern (spike S0; ruling R6).** D1 gives the container to "the
  page pattern component … its equivalent in Vue and Angular", and neither template had one: a
  page was a `section` with a page header, inside a `main` that carried the width. Each gains a
  component that owns the container, the gutters and the compact-density padding: Vue
  `shared/components/page-container.vue`, Angular `shared/components/page/` (`app-page`). Every
  page inside `main` wraps its root in it; a full-bleed page does not. The page header cannot own
  the container, because a full-bleed page has a header too.
- **Angular's install control is two components (ruling R7).** D2 lists `app-install-button/`
  "with the iOS hint". The hint is a full-width dismissible row and the button a toolbar control,
  so one component would need a mode input and two placements. Angular ships
  `app-install-button/` and `app-install-hint/`, both under the `pwa` flag's `onlyPaths`.
- **The compact-density spacing check stays (ruling R8).** D5's `shell.spec` row lists what the
  suite must assert; it does not remove a template's check that compact density tightens the
  page's spacing. That check now reads the page pattern's container instead of `main`.
