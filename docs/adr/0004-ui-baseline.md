# ADR 0004: The UI baseline

Status: accepted (2026-10-25, by plan 011 of the harness)
Owner: Eitan
Plan: `fullstack-dev-harness/.plan/011-2026-10-25-plant-care-eval-fixes.md`
Amends: `docs/conventions.md` (frontend and server contracts) and ADR 0003 (M5-1, Styling)
Superseded in part by ADR 0005: the component-library and theme-switching exclusions, U2's token
set, U3's 44 px on every pointer and `shared/ui/button` as the one button, the U1 shell path
(`shared/ui/app-shell` is `AppShell` in `shared/ui/pattern/`), U4's `chromium` project (now
`desktop`; journeys run on `phone` only) and U5's development-database rule (see [ADR 0005](0005-frontend-foundation.md), "What this supersedes").

## Context

The plant-care dogfood eval of 2026-10-25 built a product from the catalog and found gaps that
every generated project would share.

- **A bare shell.** The root layout rendered children with no landmarks, no navigation and no
  skip link. Each feature invented its own page frame.
- **Colour tokens only.** `globals.css` declared colours. Spacing, type and radius were literals
  in components, so no two screens agreed.
- **No breakpoint or touch-target rule.** Nothing said which layout is the default, nothing
  checked a phone viewport, and buttons were as small as the author liked.
- **No design input.** The e2e suite saw the page only through assertions; nobody could look at
  what it rendered.
- **E2E wrote to the development database with no rule.** Journeys left rows behind and some
  depended on rows from earlier runs.
- **`by_ip` keyed on the full IPv6 address.** One subscriber owns a /64 and can rotate through
  2^64 addresses, so a per-IP limit did not limit.
- **Windows left the reload child.** The Python server's `--reload` parent exits and leaves its
  child on the port, so the next `dev` fails with "address in use".

Decisions U1 to U5 apply to every frontend (server-rendered and SPA); U6 applies to both
servers; U7 applies to the Python server.

## Decisions

Each decision lists what it costs.

### U1. The shell

Every frontend template ships `shared/ui/app-shell` (`.tsx` in the current templates), composed
by the root layout in `app/`, which passes the nav entries to the shell as props so `shared/`
never imports `app/`:

- a skip link to `#main`, first in the tab order;
- `<header>` with the project name linking to `/` and `<nav aria-label="Primary">` built from
  `app/nav.ts`, a list of `NavEntry { to | href, label }` (`to` in react-router, `href` in
  `next/link`; both are router links);
- the page's one `<main id="main">`;
- `<footer>`.

A feature adds a nav entry and renders inside `main`; it never adds a second landmark set. The
shell is product code: a product restyles it by plan. The invariants are the landmarks, the skip
link and exactly one `main`.

Why: landmarks and a skip link are the cheapest accessibility win, and the axe scan cannot ask for
a shell that is not there. One nav table is the one place an agent adds a screen to the chrome.

Cost: every template carries a shell the product will restyle.

### U2. Token scales

`globals.css` declares the scales for the utility layer. Type, radius and shadow are declared in a
plain `@theme` block; colours are `:root` variables with dark values, exposed through
`@theme inline`:

| Scale | Names |
| --- | --- |
| Colour | `background`, `foreground`, `muted`, `muted-foreground`, `border`, `input`, `primary`, `primary-foreground`, `ring`; each with a dark variant |
| Spacing, 4 px base | Tailwind's default `--spacing` multiplier; steps 1, 2, 3, 4, 6, 8, 12, 16 (4 to 64 px). No `--spacing-N` key |
| Type | `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`, `--text-2xl`, each with a line height |
| Radius | `--radius-sm` 4 px, `--radius-md` 8 px, `--radius-lg` 12 px |

Plus `--shadow-1` and `--shadow-2`. A component uses a token, never a literal.

Why: a scale is what makes two agents' screens agree without a design review. A 4 px spacing base
with the steps above covers a form-and-list product. In Tailwind v4 a `--spacing-N` theme key
replaces the numeric step (`p-8` would become 64 px), so the scale is Tailwind's own, documented in
the template's `AGENTS.md › Styling`, and a key is never added.

Cost: a design that needs a value off the scale adds a token by plan, not a literal.

### U3. Mobile first and touch targets

Unprefixed utilities are the phone layout (base); `sm`, `md` and `lg` widen it. Their pixel
values are the template's `AGENTS.md › Styling` to state (Tailwind's defaults today). There is no
horizontal overflow at any viewport. Buttons, nav links and form controls are at least 44 x 44 px,
and `shared/ui/button` is the one place for a button.

Why 44: WCAG 2.2 AA asks for 24 px; AAA, Apple and Material ask for 44; a phone-first product
needs the larger target.

Cost: denser layouts (tables, toolbars) need a responsive variant, not a smaller control.

### U4. The phone e2e project

`playwright.config.ts` has a `phone` project (`devices['Pixel 7']`, `screenshot: 'on'`) beside
`chromium`. Every journey and the axe scan run on both. `tests/e2e/shell.spec.ts` asserts, on the
phone project, the landmarks, the skip link, no horizontal overflow and the 44 px targets. The
screenshots in `test-results/` are the UX evidence the harness's QA reads.

Why: a rule nobody tests drifts, and a screenshot is the only design input an agent has on how
the product looks.

Cost: e2e time doubles; the suites are small.

### U5. E2E and data

When the project has a database, the e2e server uses the development database: start it and
migrate before `testE2e`. A journey:

- creates its data through the API, with a name unique per run;
- removes it through the API once the product has a delete endpoint;
- never takes the development database's contents as a precondition.

Why: journeys become independent of each other and of earlier runs without a second database to
provision.

Cost: e2e can still leave rows behind until a delete endpoint exists, and shares a database with
manual work. A separate e2e database is a follow-up if this proves insufficient.

### U6. Rate-limit subject

`by_ip` in both servers keys an IPv6 address by its /64 network and an IPv4 address by itself. An
IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) is its IPv4.

Why: one /64 is one subscriber. Keying the full address lets a client rotate past any per-IP
limit; keying the mapped form separately gives one caller two buckets.

Cost: callers behind one /64 (a shared network) share a limit. That is the intended trade. What
is left: a subscriber with a /56 gets 256 buckets and one with a /48 gets 65,536, so the limit is
weaker for them; per-account limits remain the backstop, and a configurable prefix length is a
follow-up. `TRUST_PROXY` still decides which address is read.

### U7. Windows reload child

The Python server's `AGENTS.md` states that on Windows the `--reload` parent leaves its child on
the port, and gives the stop-by-port recipe. The `dev` command is unchanged.

Why: the reloader is uvicorn's behaviour, and a command-level workaround would differ per shell;
the recipe is what an agent needs when `dev` reports the port in use.

Cost: documentation only; the fault stays until upstream changes.

## What each template's agents file carries

- `AGENTS.md › Styling`: U1 to U3 with the file names (`shared/ui/app-shell`, `app/nav.ts`,
  `shared/ui/button`, `globals.css` and its four scales), and the rule that a component uses a
  token and starts at the phone layout.
- `AGENTS.md › Tests`: U4 (the `phone` project, `shell.spec`, the screenshots) and U5 (the
  database, unique names, cleanup through the API).
- Both servers' `AGENTS.md`: U6 where `by_ip` is described. The Python server's: U7.

## Versions

| Template | Version |
| --- | --- |
| `frontend/react` | 1.1.0 |
| `frontend/next` | 1.2.0 |
| `server/python-fastapi` | 1.1.1 |
| `server/bun-express` | 2.3.1 |
| Catalog | `v1.3.0` |

Additive for the catalog: `schemaVersion` stays 1.

## Out of scope

- A component library. The shell, the button and the tokens are the baseline.
- Theming beyond tokens (runtime theme switching, brand packs).
- A CDN (static-host) mode; see ADR 0003.
- Vue and Angular templates; they inherit this contract when they exist.
- A separate e2e database (U5).

## As built

U1 to U7 shipped as decided, with these differences and verified facts.

- Spacing: no `--space-*` scale. The templates use Tailwind's default 4 px `--spacing`
  multiplier and forbid a `--spacing-N` key. In Tailwind 4.3.3 a spacing utility looks up
  `--spacing-<key>` first and then `--spacing` times the number, so such a key replaces the
  numeric step (a build showed `gap-6` at 2rem). Other numbers (`min-h-11`, 44 px) use the
  multiplier.
- Type keys: `--text-<size>` plus `--text-<size>--line-height`; `.text-2xl` builds to
  `font-size: var(--text-2xl)` with the matching line height.
- Type, radius and shadow in both frontends live in a plain `@theme` block, not `:root` plus
  `@theme inline`: `--text-sm: var(--text-sm)` inside `@theme inline` is circular.
  Tailwind emits the plain `@theme` values as variables on `:root`. Colours keep the `:root` plus
  `@theme inline` pair with dark values. Both templates do this.
- `frontend/next` also changed `loading.tsx`, `error.tsx` and `not-found.tsx` from `main` to `div`
  (they render inside the layout's `main`, so a second one would break the one-`main` invariant),
  made the not-found link 44 px, and added `shared/ui/nav-links.tsx`, a client component with
  `usePathname` and `aria-current`, because the shell itself is a server component.
- `frontend/react`: `NavEntry` is duplicated structurally in `app-shell` because `shared/` cannot
  import `app/`; `nav.ts` supplies the entries through the layout. The root error boundary
  renders outside the shell with its own `main`.
- The 44 px check in `shell.spec` skips elements inside a shadow root (the Next dev overlay
  button is 32 px); no test is skipped or focused. The exemption runs inside a locator's
  `evaluateAll` callback: a locator pierces open shadow roots, whereas `document.querySelectorAll`
  never returns shadow-DOM elements, so the first form of the check never ran its exemption.
- U6: both servers produce the same /64 network text byte for byte (RFC 5952 compression, so
  `::1` gives `::/64` and `2001:db8:0:0:5::1` gives `2001:db8::/64`); the Python server uses
  `ipaddress`, `bun-express` its own expansion on `node:net`.
- U6 agents text: the "keyed by client IP" lines in both servers' `AGENTS.md` now state the
  /64 rule (an IPv6 address by its /64 network, an IPv4 address as is).
- U7: a sub-bullet under the Commands bullet in the Python server's `AGENTS.md`. Proved on
  Windows: after the `--reload` parents are stopped the port stays open and `OwningProcess` names
  the dead reloader, so killing by owner alone fails ("Cannot find a process"); the recipe stops
  the owner and its children and frees the port.
