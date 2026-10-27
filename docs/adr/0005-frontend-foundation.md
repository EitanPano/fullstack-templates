# ADR 0005: The frontend foundation

Status: accepted (2026-10-26, gate G1 of plan 013 of the harness)
Owner: Eitan
Plan: `fullstack-dev-harness/.plan/013-2026-10-26-frontend-foundation.md`
Amends: `docs/conventions.md` (frontend and SPA contracts) and `docs/capabilities.md` (cross-package
selections)
Supersedes in part: ADR 0004 (see "What this supersedes")

## Context

A product built from the catalog on 2026-10-26 (the studio-booking eval, three backlog tasks, run
through the harness's dev loop) gave a verdict on the two halves of the stack. The server
architecture held: its template gives every addition one home, ships working examples, and lint
enforces the map. The frontend did not. The template gave tokens, a shell and one button; every
task then invented its components, forms, data paths and error mapping, under accessibility rules,
and nothing judged how the result looked.

What the eval found in the generated frontend, and the decision that answers each:

| Finding | Decision |
| --- | --- |
| One UI primitive. The same field class string was pasted twice and the link styles three times; no input, field, card, badge, skeleton or menu | F2 |
| Features were nouns, so `page.tsx` passed a render slot into the schedule to get a Book button, and a later "my bookings" screen would need `ClassCard` from another feature, which the rules forbid and `shared/` cannot hold | F1 |
| Each form rebuilt its plumbing, and an error showed inline and as a toast | F7 |
| Validation limits were copied by hand from the server's schema | F5 |
| Each action repeated try/catch, a status switch and four type guards | F6 |
| `no-store` plus `revalidatePath('/')`, no cache tags, server actions passed down as props | F1, F8 |
| Auth was checked inline per page; no route groups; `loading` and `error` files copied per segment | F9, F10 |
| Time-zone (DST) conversion was hand-rolled in 80 lines | F11 |
| The project slug was the brand, the colour seed was not applied, 44 px on every pointer made the desktop chunky, and the header put the email beside a primary "Sign out" button | F2, F3 |
| e2e ran on `next dev`, the shared development database and the live rate limiter: a 15-minute wait for a limit, a flake, 62 rows left behind | F12, F13 |
| A toast fired from an effect never ran when the row unmounted in the same commit | F2 (toast rule) |
| A `fetch` body crash in the proxy runtime | F5 (spike S1) |

Five spikes ran before this ADR, each against a generated `next-bun-express` project, and their
outcomes are recorded where they bind: S1 (Hey API), S2 (Cache Components), S3 (next-safe-action
with React Hook Form), S4 (`pointer-coarse` sizing) and S5 (the client address through Next). S5
failed and its fallback applies (F14). The task added the opt-in `CLIENT_IP_HEADER` while building
(F14).

Decisions F1 to F14 apply to both frontend templates, `frontend/next` and `frontend/react`, unless
they name one. F13 applies to both server templates and F4 to the generator.

## Decisions

Each decision lists what it costs.

### F1. Layers: one home for every addition

Both templates use five layers under `src/`:

```
app/                          routing only: route groups, layouts, pages, loading/error, nav.ts
widget/<section>/             a page section: reads data, composes entities and features
  ui/<section>.tsx
  ui/<section>-skeleton.tsx
feature/<action>/             one user action (a glossary verb, or `auth`)
  model.ts                    the form schema (extends the generated zod) and its copy
  server/action.ts            'use server' mutations (Next); api/ is the SPA's mutation hooks
  ui/                         the interactive leaf
entity/<noun>/                one glossary noun
  model.ts                    contract types, view mappers, labels
  server/<noun>.ts            read loaders (Next); api/ is the SPA's query options
  ui/                         presentational components
shared/                       product-agnostic
  ui/                         shadcn primitives (copied source)
  ui/form/                    React Hook Form field bindings
  ui/pattern/                 AppShell, Page, PageHeader, EmptyState, ErrorState, AuthCard, ...
  lib/                        cn, date, safe-action, action-error, zod-messages
  api/                        generated client, types and zod; the client factory; call
  auth/                       the data access layer: session (readSession, requireAccount,
                              requireRole), cookies, refresh
  config/env.ts               the only reader of the environment
```

`src/lib/api/` moves to `src/shared/api/` and `src/env.ts` to `src/shared/config/env.ts`. The data
layer is `server/` in Next and `api/` in the SPA, as ADR 0003 and `docs/conventions.md` say.

Where an addition goes:

| Addition | Home |
| --- | --- |
| A domain object's type, mapper, label, badge or card | `entity/<noun>/` |
| A read, public or per-user | `entity/<noun>/server/<noun>.ts` (`api/` in the SPA) |
| A mutation and the button or form that runs it | `feature/<action>/` |
| A page section that combines reads and actions | `widget/<section>/` |
| A route, its layout, loading and error | `app/(group)/...` |
| A primitive (button, input, dialog) | `shared/ui/`, added with `shadcn add` |
| A reusable layout pattern | `shared/ui/pattern/` |
| A form field binding | `shared/ui/form/` |
| Date and time helpers | `shared/lib/` |
| A server-only auth check | `shared/auth/` |
| An environment variable | `shared/config/env.ts` plus `.env.example` |
| A navigation entry | `app/nav.ts` |

Import rules, enforced by `eslint-plugin-boundaries` (exact pin, ESLint 9 compatible), which
replaces the hand-written zones. Each message names the layer to use instead:

- `app` imports widget, feature, entity, shared. `widget` imports feature, entity, shared.
  `feature` imports entity, shared. `entity` imports shared. `shared` imports shared.
- An entity imports another entity only with `import type` from its `model.ts`.
- No slice imports a sibling slice in its own layer.
- A `'use client'` file imports from `server/` only an `action.ts` (`'use server'`) or types.
- `shared/api` is imported only by `*/server/*` (`*/api/*` in the SPA) and `shared/auth`. The one
  exception is a `model.ts` in `entity/` or `feature/`: it may `import type` from `shared/api` and
  value-import the generated zod schemas (`shared/api/generated/zod.gen`), because a form schema
  extends them and limits are never copied.
- `no-restricted-syntax` forbids the `button`, `input`, `select` and `textarea` JSX elements
  outside `shared/ui`. `revalidatePath` and a bare `fetch(` are restricted outside `shared/api`.
- `process.env` is read only in `shared/config/env.ts` (a `no-restricted-properties` rule). A
  `fetch(` is restricted outside `shared/api`, and the `shared/ui` block keeps the network rule too.

The seeded-violation test is rewritten for these rules: one violation and one allowed case per
rule, through ESLint's Node API and the real config. The file is
`tests/unit/eslint-boundaries.test.ts` in both templates.

The template's example slices are product-neutral, and a product replaces them: `entity/health/`
(model, loader, a `HealthBadge`), `widget/system-status/`, `feature/refresh-health/`, and, when the
server has auth, `feature/auth/`, `entity/user/`, `widget/account-menu`, `widget/guest-only`,
`widget/sign-in`, `widget/sign-up` and `widget/profile`.

Why five layers instead of ADR 0003's three: the eval hit both failure modes of noun features (the
render slot, and the screen that needs another feature's card). `entity` gives product-specific
reusable UI a home; `widget` gives composition-with-data a home, so `app/` stays routing only.
This is Feature-Sliced Design's layer model without `pages` (the framework's router is that layer)
and without `processes` (deprecated upstream). Layer names are singular, as `docs/conventions.md`
and the harness's naming rule have it: an entity is a glossary noun, a feature a glossary action,
a widget a screen section.

Cost: more directories for a small app. In exchange, each addition has one obvious place and lint
makes the map mechanical, which is what made the server template work.

### F2. The design system

Primitives are shadcn/ui on Radix, with `cva` variants and `tailwind-merge` through `cn`, copied
into `shared/ui/`. `components.json` maps `ui` to `@/shared/ui` and `utils` to `@/shared/lib/cn`.
The CLI is pinned. The template ships button, input, textarea, label, the Field family, select,
checkbox, radio-group, switch, card, badge, alert, skeleton, separator, dialog, sheet,
dropdown-menu, avatar, tabs, tooltip and sonner. An agent adds another with
`bunx shadcn@<pin> add <name>`; the template's `AGENTS.md` names that as the one scaffolder an
agent may run, and `shadcn init` stays forbidden.

Patterns in `shared/ui/pattern/`, adapted to the router (`Link` in Next, `NavLink` in the SPA):

- `AppShell`: header, nav inline from `md` and a Sheet on phones, an account slot, footer.
- `Page`, `PageHeader` (title, description, actions), `Section`.
- `EmptyState`, `ErrorState` (with retry), `ListSkeleton`, `CardSkeleton`.
- `AuthCard`, `FormActions` (sticky on phones), `ConfirmDialog`.
- `UserMenu`: an avatar trigger with an items slot.

Tokens are shadcn's semantic set in OKLCH, plus `success`, `warning` and `info`: `background`,
`foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`,
`success`, `warning` and `info`, each with its `-foreground`, then `border`, `input`, `ring` and
`radius`. Light values sit in `:root` and dark values in `.dark`, with `@custom-variant dark`.
Components use only the utilities (`bg-primary`, `text-muted-foreground`), never a literal.
Spacing stays Tailwind's 4 px multiplier with no `--spacing-N` key, and type, radius and shadow
keep their plain `@theme` form (ADR 0004, U2 and its "As built").

Dark mode: `next-themes` in Next and a small `ThemeProvider` in the SPA, both with
`attribute="class"`. The default comes from the brand input (F3), and a toggle sits in the
`UserMenu`. When auth is off, the template's `UserMenu` is a theme menu. This replaces the
media-query block, which cannot be toggled and lets the page flash in the wrong theme on load.

Sizing: WCAG 2.2 AA asks for 24 x 24 px targets (2.5.8). The 44 px rule stays for touch: controls
are `h-9` (shadcn's density) on a fine pointer and `pointer-coarse:h-11` under a coarse one, and an
icon button pairs `pointer-coarse:size-11`. Spike S4 measured 44 px on Playwright's `Pixel 7` and
36 px on `Desktop Chrome`, with no configuration; a custom phone project must spread
`devices['Pixel 7']`, because only a touch device matches `pointer: coarse`.

Status: badges by meaning (`success`, `warning`, `destructive`, `muted`), never raw palette
classes, and never colour alone. The v1 `StatusPill` used palette literals.

Icons and toasts stay lucide and sonner, one of each per package. The toast rule: a toast fires
from the event handler after awaiting the action, never from an effect. Spike S3 proved it: a
toast called from the handler still shows after the row that held the button has unmounted,
because the `Toaster` lives in the root layout.

Cost: a design system the repository owns, since shadcn copies source. An upgrade is a re-run of
`shadcn add` and a diff, not a version bump. Radix and cva are runtime dependencies.

### F3. Brand inputs

The generator accepts, as options and in the answers file under `answers.brand`:

| Option | Values |
| --- | --- |
| `--display-name` | free text |
| `--brand-primary <hex>` | a colour |
| `--brand-neutral <hex>` | a colour |
| `--radius` | `sm`, `md`, `lg` |
| `--font` | `system`, `inter` |
| `--theme` | `system`, `light`, `dark` |
| `--density` | `comfortable`, `compact` |

The defaults reproduce a neutral palette with today's blue as the primary: `--display-name` is
the project name in title case (cut at a word boundary to 60 characters), `--brand-primary`
`#1d4ed8`, `--brand-neutral` `#64748b` (a slate), `--radius md`, `--font system`, `--theme system`
and `--density comfortable`. A display name is 1 to 60 characters of letters, digits, spaces and
`. , : ! ? _ -`, starting with a letter or digit, with no two underscores in a row (they read as a
placeholder); the generator refuses anything else, because the name is substituted into JSON,
TSX and CSS.

`tools/lib/theme.ts` is pure and unit-tested. It builds OKLCH scales from the two seeds, derives
the light and dark value of every F2 token, and checks WCAG contrast: text pairs at least 4.5:1,
`input` and `ring` against the background at least 3:1. It moves lightness until each pair passes,
and fails generation, naming the pair, when a seed cannot pass.

New generated placeholders: `PROJECT_DISPLAY_NAME` (the metadata title template, the header and
the footer), `THEME_LIGHT` and `THEME_DARK` (the CSS declaration blocks placed into `globals.css`;
placeholders work in `.css`), `THEME_RADIUS` (`0.25rem`, `0.5rem` or `0.75rem` for `sm`, `md`, `lg`),
`THEME_DEFAULT` (the theme), `THEME_DENSITY`, `THEME_FONT` and `THEME_FONT_STACK` (the full
`font-family` value). A frontend's e2e config also gets `SERVER_START_COMMAND`,
`SERVER_E2E_DB_COMMAND` and `SERVER_E2E_DATABASE_URL` (F12). The project slug stays for package
names. Both templates always depend on `@fontsource-variable/inter` and import its `@font-face`
CSS (a browser downloads only a font that is used, and a build needs no network);
`THEME_FONT_STACK` carries the `font-family` value, `system` or `'Inter Variable'` first. The cost
is one unused dependency in a `--font system` project. `--density compact` sets the fine-pointer
control heights and leaves touch sizing alone. Provenance records the resolved brand (defaults
filled in) under `answers.brand` whenever the plan has a frontend, through optional fields in its
schema.

Why the generator and not the product: the eval's colour seed was never applied, and a palette
chosen by an agent at task time is not checked for contrast. A pure function with a test is.

Cost: the generator owns colour maths. The algorithm is simple (a lightness search per pair) and
its output is plain CSS, so a product can edit the values afterwards by plan.

### F4. Cross-package selections

A frontend's marker selections gain `server:<name>` for each selection of the stack's server
package, its flags and its capability kinds: `server:auth`, `server:database`. The names already
pass the marker lexer. A template may declare `onlyWhen: { "server:auth": [paths] }`; those files
are kept only while the selection is on. A path may name a route group with parentheses
(`src/app/(auth)`); `..`, `(..)`, `(...)`, absolute and backslash paths are refused. The frontend
has no flag of its own named `auth`, so `--flag auth=...` stays unambiguous: it sets the server's
flag.

`validate`'s dry run covers the combinations: a frontend with an `auth=false` server, and a
frontend generated alone, where every `server:*` selection is off. `docs/capabilities.md` and the
template schema document the selection.

Why: the auth flows, the `(auth)` routes and the `UserMenu`'s sign-out exist only when the server
can authenticate. Without this, the files either ship dead or the product deletes them.

Cost: a frontend template now depends on the names of its servers' flags. A server renaming `auth`
is a breaking change for every frontend; `validate` fails it.

### F5. Contract codegen

`contract` runs Hey API (`@hey-api/openapi-ts`, exact pin 0.99.0, a dev dependency) into
`shared/api/generated/`, committed and never edited: types, a fetch client and zod schemas. The
SPA also gets the react-query plugin. The fetch client is emitted into `generated/`, so there is
no runtime package beyond zod.

`shared/api/client.ts` creates the client per call:

- In Next it runs on the server with `API_URL` and the `Authorization: Bearer` header from the
  session. It sets no custom `fetch` (spike S1: the generated client builds its own `Request`) and
  never uses the generated module-level singleton on the server. By default it forwards no
  `X-Forwarded-For`; the optional `CLIENT_IP_HEADER` turns on forwarding of the visitor's address
  (F14).
- In the SPA it uses the relative `/api` and same-origin cookies, plus the refresh of F9.

A form schema extends the generated request schema, for example
`zPublishClassBody.extend({ startsAt: zWallTime })`. Limits are never copied; the only extension
is a UI coercion, such as a `datetime-local` string or a number input's text. The error body is
typed, which replaces hand narrowing. Spike S1 also proved: a Server Action POST and a `proxy.ts`
POST both work with a JSON body and a 2xx or 400 answer. The v1 "expected non-null body source"
crash did reproduce later, on a 401: the fetch spec retries a request with ambient credentials, and
Next's patched fetch cannot replay the body. `createApi` therefore sets `credentials: 'omit'` (the
API takes explicit headers only), with a unit test;
the generated zod extends under React Hook Form with `z.input` and `z.output` as the generics;
and both servers' documents generate and type-check.

Notes the spike recorded and the template handles: `response` is optional in the result, and a
network failure returns the thrown value typed as the error body, so `call` checks
`response === undefined` first; generated names are path-derived, so features wrap them; the
generated code is ignored by lint; `postProcess: ['prettier']` replaces the deprecated `format`;
Bun's OpenAPI has no `format: email` and Python's has it, so Hey API emits its own email check
for Python, with zod's default message. Every form field with our copy therefore sets that copy
itself, whatever the generated schema carries: the form runs the generated check plus a plain
email check and words a failure once, and `shared/lib/zod-messages.ts` words the generated limits
and formats for the browser resolver and the action's input schema alike. (A form that trusted
the generated message showed zod's default text on the Python stack, which turned CI red.)

Cost: Hey API is 0.x and minors can break output. It is pinned exactly and upgraded by plan, and
generated code is larger than `openapi-typescript`'s. The gain is one generator for three outputs,
which ends copied limits and hand-written narrowing.

### F6. Mutations

In Next, `shared/lib/safe-action.ts` holds the action client (next-safe-action 8.7.3, exact):

- `action`, and, with `server:auth`, `accountAction` and `roleAction(role)`. The account
  middleware reads the session (`readSession`, memoised per request) on every call and refuses with
  an `ActionError` when there is none; `roleAction` adds the role check. The middleware is the data
  access layer for actions, so no action can forget the check. Pages and loaders use
  `requireAccount` and `requireRole`, which redirect.
- `ActionError` carries copy we wrote, never the server's text. `handleServerError` returns an
  `ActionError`'s message, and logs anything else and returns a generic message. Spike S3 showed an
  error whose text held a secret reaching the log and not the client.

`shared/api/call.ts` maps an API result to data or to an `ActionError`, using the feature's copy
table keyed by the envelope's `code`. A product whose contract adds a discriminator passes it as a
second key. `shared/lib/action.ts` (`ActionResult`) is retired. A feature's client leaf imports its
action directly, so there is no prop drilling of actions. The SPA's mutations are TanStack Query
`useMutation` with the same `call` and the same copy tables.

Removed from every feature: try/catch, the status switch and `console.error`, the `ActionResult`
plumbing, the per-action auth check and the runtime narrowing.

Cost: a dependency with its own API. It is the most-used typed-action library for Next, and its
middleware chain is explicit. Writing our own action client is the harness glue the anti-goal in
the plan rules out.

### F7. Forms

React Hook Form 7.90.0 with `@hookform/resolvers` 5.9.1 (`zodResolver`), wired through
`useHookFormAction` (`@next-safe-action/adapter-react-hook-form` 2.1.0, imported from its `/hooks`
subpath) in Next and `useMutation` in the SPA. `shared/ui/form/` binds `Controller` and `Field`
once: `TextField`, `TextareaField`, `NumberField`, `SelectField`, `CheckboxField`, `PasswordField`
and `DateTimeField` (zone-aware, F11). A feature form is one line per field.

One schema validates in the browser and on the server, server validation errors land on their own
fields (`returnValidationErrors`, spike S3), and values survive a failed submit. A field error
shows on its field with `aria-invalid` and `aria-describedby`; the toast reports the outcome and
never repeats a field error.

Cost: forms need JavaScript. Progressive enhancement through `useActionState` or Conform would not,
but both templates are app UIs, and React Hook Form is the one form library both can share.

### F8. Reads and caching

**Next.** `cacheComponents: true` (with `partialPrefetching` set explicitly, which silences a build
warning). A public read is a `'use cache'` loader with `cacheTag('<entity>')` and a `cacheLife`
profile. A per-user read is dynamic, inside Suspense. A cached loader throws on failure, so a
failure is never cached, and the widget renders `ErrorState`. A mutation calls `updateTag` for
every entity whose reads it changes, and never `revalidatePath`. The session read is memoised per
request with React `cache`. A `'use cache'` function that reads `cookies()` fails the build, so
the cookie is read outside and passed in.

Spike S2 changed one thing. A `'use cache'` loader that sits in the static shell runs at
`next build`, and the image build stage has no API, so the build fails with `ECONNREFUSED`. The
decision is therefore the request-time hole: every data widget is an async component inside
Suspense that first awaits `connection()` (from `next/server`), then calls its cached loader. The
build never calls the API, the cache works at request time (one loader call per tag invalidation,
shared across users), and `updateTag` still gives read-your-own-writes. `/` stays a Partial
Prerender shell. The cost is visible: the first paint shows the widget's skeleton and the data
streams in, because the cache saves the API call, not the streaming hole. Uncached request-time
data outside Suspense fails the build, so a page is a synchronous component with its data in
widgets.

**SPA.** TanStack Query with Hey API's query options. A route loader calls `queryClient.query` (see
"Decisions made while building"), a
widget calls `useSuspenseQuery`, and a mutation invalidates its entities' query keys.

Replicas: Next's default cache handler is per process, so past one frontend replica each instance
has its own cache and `updateTag` reaches only the one that ran the action. The catalog's Next
`AGENTS.md › Deployment` states this. The harness's `deployment` skill gains the same paragraph in
the harness's own adoption phase, not here.

Cost: Cache Components change how every Next page is written (what may be read where), and the
rules are learned from build errors. The template's example and `AGENTS.md` carry them.

### F9. Auth glue

Present only when the server has auth (`server:auth`, F4).

**Next.**

- `shared/auth/session.ts` (server-only) has `readSession` (memoised with React `cache`),
  `requireAccount()` (redirects to sign-in) and `requireRole(role)` (redirects an account with
  another role to the `/forbidden` page; no experimental Next API such as `forbidden()`). This
  follows Next's authentication guide in part: the proxy refreshes tokens, and the data access layer
  does every real check. The template's proxy does not redirect, unlike the guide's optimistic
  example.
- `feature/auth/server/action.ts` has `signUp`, `signIn` and `signOut`. They call the API and set
  `access_token` and `refresh_token` as HttpOnly, `SameSite=Lax` cookies, `Secure` in production,
  on the Next origin, with the API's lifetimes.
- `proxy.ts` refreshes an expired access token with the refresh token (request body
  `refreshToken`) and rotates both cookies. A refusal (400, 401, 403) clears both cookies and the
  request continues; an outage or a rate limit changes nothing. It never redirects and never checks
  permissions: access is decided only in the data access layer.
- Route groups: `(auth)` holds sign-in and sign-up and sends a signed-in account away; `(site)`
  carries the shell. `(site)` also holds the `/forbidden` page and a guarded `/profile` page, the
  worked example of a signed-in screen (a page that renders a static shell and a widget that calls
  `requireAccount`). `AGENTS.md` documents a `(site)/(staff)` group whose layout calls
  `requireRole('admin')`. Layouts do not re-run on client navigation, so every staff page and
  loader also calls `requireRole` (memoised, so free) and every staff action uses `roleAction`.
  The template ships no staff page, because no admin can be created yet.

**SPA.** The client middleware turns a 401 into one `POST /api/auth/refresh` and a retry, and
collapses concurrent refreshes into one. Route loaders guard routes with `requireAccount` and
`requireRole`, and a `RequireRole` component hides controls. The `(auth)` routes are the same as
in Next.

The `UserMenu` (avatar, email, theme, sign out) is in the shell's account slot. The email is never
header text beside a primary button.

Cost: the template owns token handling that a product with a different scheme must replace. The
client, token and verification model is recorded in the project's `.doc/architecture.md › Auth`
and changes only by plan. The staff pattern cannot be exercised end to end until the server can
create an admin. A refresh response that never reaches the browser, replayed after the API's 30 s
grace window, reads as reuse and signs the account out everywhere; `proxy.ts` refreshes at the
start of a request to keep the window short.

### F10. Errors and loading

`loading` and `error` files exist per route group, not per segment. Every widget has a skeleton
that matches its layout. Next gains `global-error.tsx`. The harness's `ui-and-styling` rule
("a loading and an error state for every new route segment") changes in the harness's adoption
phase to "every route has a loading and an error state, its own or its group's; every widget has
a skeleton". Error copy stays user-safe.

Cost: a segment that needs different copy than its group adds its own files.

### F11. Dates

`shared/lib/date.ts` uses `date-fns` v4 with `@date-fns/tz`. It converts a wall time to an instant
and back in a named zone, computes day keys, and formats dates and times. A time in a DST gap is
refused and an ambiguous time takes the earlier instant; both are unit tested across a London
transition. It replaces a hand-rolled `Intl` conversion.

Cost: two dependencies. Temporal can replace them when Node and Safari both ship it.

### F12. Tests and the e2e setup

**Unit.** Vitest with React Testing Library. The template tests its own glue once, so products do
not re-test primitives: the field bindings, the shell nav, `call`, the action client, theme
toggling and the F9 helpers (session helpers; each action's success and failure paths: a taken
email, 401, 429; refresh, including two concurrent 401s that cause one refresh; a wrong role
redirected to `/forbidden`).

**E2E server.** Playwright's `webServer` runs the production build. Next: `scripts/e2e-server.mjs`
runs `bun run build`, copies `.next/static` and `public/` into `.next/standalone` and runs
`server.js` on port 3000, the server the image runs (`next start` would work but warns under
`output: 'standalone'`, spikes S3 and S5). SPA: `vite build` then `vite preview`. A build is slower
to start, and in exchange "the image builds" is checked on every task. The SPA keeps `E2E_BASE_URL`
for its container mode, and Next gains the same switch.

**E2E backend.** Playwright starts the backend fresh, with `reuseExistingServer: false`, from the
server's `start` command (F13). Its `env` sets `RATE_LIMIT_SCALE=100` (F13) and, with
`server:database`, the provider's `e2e` URL (`app_e2e`). With `server:database`, the API's web
server command is `<server e2eDb> && <server start>`, so the database is created, migrated and
truncated before the API connects. It is not a `globalSetup`: Playwright 1.64.1 starts its web
servers before global setup. `E2E_DATABASE_URL` overrides the provider's `e2e` URL. The development
database is never touched.

**Projects.** `phone` (`devices['Pixel 7']`, touch) runs every journey with its axe scan.
`desktop` (`devices['Desktop Chrome']`) runs the shell spec and the screens spec. `retries: 0`, and
a trace is kept on failure: a test that passes only on a retry is a failure.

**Screens spec.** `screens.spec.ts` captures every `nav.ts` route, plus sign-in and sign-up when
auth is on, on phone and desktop, in light and dark, to
`test-results/screens/<route>-<viewport>-<theme>.png`. These are the visual evidence the harness's
UI pass and QA read. Committed baselines are not used: images rendered on Windows and on Linux CI
differ and would flake.

Cost: a journey runs once, on the phone project, so a desktop-only layout defect is caught by the
shell and screens specs and by the reviewer, not by a journey.

### F13. Server templates

`bun-express` 2.4.0 and `python-fastapi` 1.2.0 change only what e2e and test output need; the
server architecture is unchanged.

- **`RATE_LIMIT_SCALE`:** a number from 1 to 1000, default 1 (above 1000 the server refuses to boot,
  so the scale cannot become a bypass), read once in the env module and
  documented in `.env.example`. It multiplies every limit in `RATE_LIMITS`. Production keeps the
  default. There is no bypass switch: a bypass is a production hole waiting for one wrong
  environment variable, while a scale keeps every limit real at a different size.
- **`start`:** a new command name in the schema's `commands` enum. It runs the server with no
  watcher (`bun run start`, `uv run python -m app.main`); a frontend's e2e starts the API with it,
  so the suite does not depend on a dev server's reload or watcher.
- **`e2eDb`:** a new command name in the schema's `commands` enum, present only with a database
  provider (an overlay `commands` entry). It creates the database named by the provider's `e2e`
  URL if it is missing, migrates it, and truncates every table except the migrations table. It
  refuses any database whose name does not end in `_e2e`, refuses a URL with a `dbname` query
  (libpq lets it override the path), and checks `current_database()` before it migrates.
  `E2E_DATABASE_URL` overrides the provider URL; a blank value counts as unset.
- **The provider's env contract** gains `e2e: postgres://app:app@127.0.0.1:5432/app_e2e`.
- **Test logs.** Tests that raise errors on purpose capture or silence them (the eval's "boom",
  pubsub and PostgresError output). A green run prints no stack trace. A test that expects an error
  asserts it through an allow-list, and a log line outside the list fails the test.
- **The Compose fragment** stops warning about unset app secrets on infra-only commands
  (`docker compose up -d --wait database`).

Why `e2eDb` creates the database instead of `db/init.sql`: `init.sql` runs only on a fresh volume
(its own header says an existing volume is not touched), so an `app_e2e` added there would miss
every existing developer volume.

Cost: the e2e database is a second database to keep migrated, which `e2eDb` does on every run.

### F14. The client address behind Next

Spike S5 failed. Next 16.4.2 fills `x-forwarded-for` from the socket only when the client sent
none (`req.headers['x-forwarded-for'] ??= socket.remoteAddress`); a client-sent value, including
its last entry, reaches app code unchanged, and `x-real-ip` and `forwarded` are never set. No value
visible to application code is out of the client's control, so the template cannot forward a
trustworthy browser address to the API.

The fallback applies by default: the Next client forwards no `X-Forwarded-For`. The API's per-IP
limiter then sees the Next server's own address, one shared bucket for every visitor, and the
per-email limits are the effective ones. That is also a lock-out risk: sign-up is limited to 10
per 15 minutes per IP, so one script could block every registration (a decision made while building the
template).

So the address is opt-in. `CLIENT_IP_HEADER` (optional, unset by default, a header name such as
`x-forwarded-for` or `x-real-ip`, validated at startup) names the header that a proxy YOU control
sets or appends with the visitor's address. When it is set, `createApi` forwards the rightmost
entry of that header as `X-Forwarded-For` (a value that is not an IP address, or carries a zone
id, is dropped), and the server's `TRUST_PROXY` must count the Next server as a hop. It is safe
only while the container is not reachable directly: a visitor who can reach Next chooses the
header. A production deployment behind a platform or reverse proxy must set it; the template
cannot verify the proxy, so the Next `AGENTS.md › Deployment` states the condition. Public cached
loaders never forward. A custom Node server would expose the socket address but loses the
standalone `server.js` path, and is not adopted.

Cost: without `CLIENT_IP_HEADER`, one shared per-IP bucket for a Next frontend, so a burst from
many users can exhaust it and a script can lock out sign-up and sign-in. With it, correctness
rests on a deployment promise. `RATE_LIMIT_SCALE` (F13) is a lever for sizing, not a fix for
either case.

### Decisions made while building

The build changed or settled these; each is in the template's `AGENTS.md`.

- The `(auth)` route group stays, so the generator accepts parentheses in `onlyWhen` and
  `onlyPaths` (F4).
- `proxy.ts` clears the cookies on a refusal and continues; it never redirects (F9).
- `requireRole` redirects to a stable `/forbidden` page; the template sets no experimental Next
  option (`forbidden()`, `authInterrupts`). Cost: a forbidden page answers 200 after a redirect,
  not 403. Server Actions still refuse through `roleAction`.
- A `model.ts` may value-import the generated zod schemas (F1, F5).
- `createApi` sets `credentials: 'omit'` (F5).
- Compact density applies only on a fine pointer, and the dialog and sheet close buttons are 44 px
  on touch (F2).
- Playwright's config takes `E2E_DATABASE_URL?.trim() ||` the default, and refuses at load any URL
  whose database name does not end in `_e2e` (F12).
- Generation fails closed when a planned server lacks `commands.start`, or when `server:database` is
  on without `commands.e2eDb` or a provider `e2e` URL. There is no silent fallback (F12).
- Next forms `reset()` after a successful sign-in or sign-up, because `cacheComponents` keeps
  visited routes mounted (hidden) under React Activity.
- Container-mode e2e (`E2E_BASE_URL`) against a long-lived stack runs at rate-limit scale 1. It can
  run about once per 15 minutes per stack and leaves its users in that stack's `app` database. The
  case runner does `up`, then `down -v` (F12).
- SPA loaders call `queryClient.query(...)`, not `ensureQueryData`: the pinned TanStack Query
  (5.104.2) deprecates `ensureQueryData` and `fetchQuery` in favour of `query`, and lint fails on
  them. It has fetch semantics: data fresh within the 30 s `staleTime` is returned,
  otherwise it fetches.
- The no-flash theme script is a file, `public/theme-init.js`, not inline in `index.html`, because
  every deployed SPA page carries `script-src 'self'`, which blocks an inline script.
- `shared/api/session-hint.ts` is a `localStorage` flag, never a token. It is set after sign-in and
  sign-up and cleared on sign-out and when a refresh answers 400, 401 or 403 (429, 5xx and network
  errors keep it). Both servers answer a refresh with no cookie with 400, which is what an expired
  refresh cookie produces, so 400 clears it too; Next treats the same three statuses as a refusal.
  The client refreshes a 401 only when the hint is set; without one the page shows the signed-out
  view, so a visitor's session probe does not spend the API's per-address refresh attempts. A user
  who cleared storage but not cookies appears signed out until the next sign-in.
- The Hey API react-query plugin runs with `infiniteQueryOptions: false` because the template has
  no paginated endpoint to use them. Turn it on with the first one.
- Without `CLIENT_IP_HEADER`, all Next visitors share one per-address budget (refresh 30 and sign-in
  10 per 15 minutes), so a default deployment holds about 30 active signed-in visitors per 15
  minutes; past that, sessions end and sign-in is refused. The recipe is a TLS proxy you control,
  the Next port reachable only from it and `CLIENT_IP_HEADER` set (the Compose fragment passes it);
  see the Next `AGENTS.md › Deployment`. Planned follow-up: the servers key the refresh limit on
  the token, not the address.
- A server field error whose path the form does not register (a server-only or renamed field)
  becomes a toast with the error's message, so a submit never ends in silence.
- The e2e projects select their specs by tag: a check for one project carries `@phone` or
  `@desktop`, and the other project's `grepInvert` leaves it out; never by a runtime `test.skip`, which the harness's `verify` refuses in a diff.
- A blank `E2E_BASE_URL` counts as unset, like a blank `E2E_DATABASE_URL`.
- Next forms submit through a shared navigation-error helper: it ignores only Next's navigation
  errors (redirect, not-found) and rethrows anything else. A redirecting action rejects its promise,
  which `<form onSubmit>` would otherwise drop as an unhandled rejection.
- The SPA's `noindex` is a client-side `<meta>` rendered by the page, so a crawler that does not
  run JavaScript does not see it. This is a known limitation of a static shell; Next sets it in the
  server-rendered head.

## Alternatives considered

- **Keep the feature-only map, add `entity/` only.** Smaller, and it fixes the "my bookings"
  case, but `app/` would still compose data and slot actions, which is the first failure the eval
  hit. Rejected for `widget`.
- **A hand-made component kit, or shadcn's Base UI variant.** The kit is harness-owned
  design work for no gain; the Base UI variant is newer and has less of the ecosystem agents
  already know. Radix-based shadcn is the form the models know best.
- **`useActionState` with Conform, or our own action client.** Conform gives forms that work
  without JavaScript, which these app UIs do not need; neither shares code with the SPA. Our own
  action client is glue an industry tool already provides (S3 passed, so the fallback of
  `useActionState` with our own bindings stays unused).
- **`openapi-typescript` with `openapi-fetch`, plus Hey API's zod plugin alone.** The S1
  fallback, kept in reserve. Two generators and a hand-written bridge between types and zod are
  what the eval found copying limits; S1 passed, so one generator is used.
- **No Cache Components: `fetch` with `next: { tags }` under the same `updateTag` rule.** The S2
  fallback. Cache Components passed, and give per-widget streaming and a prerendered shell; the
  request-time hole removes the build-time API dependency that was its one blocker.
- **A `'use cache'` loader directly in the static shell.** Fails the image build, which has no
  API (S2). Rejected for the `connection()` hole.
- **44 px on every pointer.** The v1 rule, kept as the S4 fallback. It made the desktop chunky;
  `pointer-coarse` keeps 44 px where a finger is.
- **A rate-limit bypass for e2e, or a shared development database.** A bypass is a production
  switch; the shared database left 62 rows behind and made journeys depend on earlier runs.
- **`app_e2e` in `db/init.sql`.** Misses every existing volume (F13).
- **Forwarding the address from the client's own header by default.** Spoofable (F14); forwarding
  is opt-in through `CLIENT_IP_HEADER`.
- **`loading` and `error` per segment.** The eval's files were copies of each other. A group's
  files cover its routes.
- **`Intl`-based date conversion kept by hand, or Temporal.** The hand-rolled version was 80
  lines of code every product carries; Temporal is not shipped in Node and Safari together yet.

## What this supersedes

In ADR 0004:

- Out of scope, "a component library": superseded by shadcn/ui (F2).
- Out of scope, "theming beyond tokens (runtime theme switching, brand packs)": superseded by
  `next-themes`, the `ThemeProvider` and the brand inputs (F2, F3).
- U2's token set (the nine colour names, `--radius-sm/md/lg`, `--shadow-1/2`): superseded by the
  OKLCH set of F2. The 4 px spacing rule, the ban on a `--spacing-N` key and the plain `@theme`
  block for type stand.
- U3's "buttons, nav links and form controls are at least 44 x 44 px" on every pointer:
  superseded by `pointer-coarse` sizing (F2). Mobile first and no horizontal overflow stand.
- U3's "`shared/ui/button` is the one place for a button": superseded by "`shared/ui` is the one
  place for a control", enforced by lint (F1, F2).
- U5's "e2e uses the development database": superseded by `app_e2e` and `e2eDb` (F12, F13). Its
  rules for unique names per run and cleanup through the API stand.
- Out of scope, "a separate e2e database": done (F13).

Two edges ADR 0004 did not list, recorded here so nothing contradicts silently:

- U1 puts the shell at `shared/ui/app-shell`; it is now `AppShell` in `shared/ui/pattern/`. Its
  invariants (the skip link, the landmarks, exactly one `main`, the entries passed in as props)
  stand.
- U4 runs every journey on `chromium` and `phone`. Journeys now run on `phone` only, and the
  `chromium` project is renamed `desktop` and runs the shell and screens specs (F12). The shell
  spec's 44 px assertion applies to the touch project only.

ADR 0004 stands for the shell landmarks and skip link (U1), the phone project and its screenshots
(U4), `by_ip` (U6) and the Windows reload note (U7). In `docs/conventions.md`, the frontend and
SPA sections are rewritten to the F1 layers (the server sections are unchanged), and the layer map
`app -> feature -> shared, lib` is replaced by F1's directions. ADR 0003's M5-1 file shape is
amended by F1: `feature/<name>/` becomes the five layers, and `lib/api/` becomes `shared/api/`.

## Consequences

**Template majors.** Every frontend file moves, so `frontend/next` and `frontend/react` are major
releases, 2.0.0 each. There is no migration path for a generated project: a product regenerates,
or moves its files by plan. The server templates change additively (`bun-express` 2.4.0,
`python-fastapi` 1.2.0).

**What a product does differently.**

- It replaces the example slices (`health`, `system-status`, `refresh-health`) with its own
  entities, features and widgets, and puts a page together as `PageHeader` plus a Suspense'd
  widget.
- It adds a control with `shadcn add`, never a raw element, and a screen from the patterns.
- It writes a mutation as a schema, one `call` and one tag (`updateTag` or a query key), not as
  a handler with a status switch.
- It gives the generator its brand at the bootstrap; the harness's bootstrap passes the Design
  answers.
- Its e2e runs the production build against a fresh backend and `app_e2e`.

**Costs.**

- Eight new runtime or build libraries (shadcn's Radix set, next-safe-action, React Hook Form with
  its resolver, Hey API, `next-themes`, `date-fns`, TanStack Query in the SPA, the boundaries
  plugin), each pinned exactly and upgraded by plan. The error rate of agents new to them is the
  risk; the answer is a worked example per library in the package's `AGENTS.md` and lint messages
  that name the right layer.
- The e2e suite builds the app before it tests. Next's build cache and one build per run limit it.
- A Next frontend without `CLIENT_IP_HEADER` shares one per-IP rate-limit bucket (F14), and a Next
  frontend with several replicas has one cache per replica (F8).
- The generator owns colour maths (F3) and cross-package selections (F4).

**Versions.**

| Template | Version |
| --- | --- |
| `frontend/next` | 2.0.0 |
| `frontend/react` | 2.0.0 |
| `server/bun-express` | 2.4.0 |
| `server/python-fastapi` | 1.2.0 |
| Catalog | `v1.4.0` |

Every schema change is an optional field (`answers.brand`, `onlyWhen`, the case fields for a
frontend case to set its server's flags, the `start` and `e2eDb` command names, the provider's `e2e`
URL), so `schemaVersion` stays 1 and the catalog release is a minor, as with ADR 0004.

**Pins** (checked against the registry on 2026-10-26, each at least 14 days old): `next-safe-action`
8.7.3, `@next-safe-action/adapter-react-hook-form` 2.1.0, `react-hook-form` 7.90.0,
`@hookform/resolvers` 5.9.1, `@hey-api/openapi-ts` 0.99.0. Next's other pins, from
`frontend/next/base/package.json`: shadcn CLI 4.21.4, `radix-ui` 1.8.0, `eslint-plugin-boundaries`
7.2.0, `date-fns` 4.4.0, `@date-fns/tz` 1.5.0, `next-themes` 0.4.6, `@fontsource-variable/inter`
5.3.0. TanStack Query and the SPA's pins are recorded in `frontend/react/CHANGELOG.md` once the SPA
template lands; fill them in at the release task.

## Out of scope

- A Figma pipeline, Storybook, or committed visual-regression baselines.
- Vue and Angular templates; they inherit this contract when they exist.
- A CDN (static-host) mode; see ADR 0003.
- A staff page and a way to create an admin; the `(staff)` group is documented, not shipped.
- Internationalisation.
- The harness's adoption of the foundation (the `ui-design` skill, the frontend agent's UI pass,
  the bootstrap's brand answers, the `deployment` skill's replica paragraph, the `catalog.lock`
  bump): a later harness plan.

## Worked example

The same eval app, laid out in the new shape (studio booking: a class schedule that members book,
and an admin who publishes classes):

```
entity/class/            model.ts (ScheduleClass, toClassView, spotsLabel)
                         server/class.ts (getSchedule: 'use cache', cacheTag('class'))
                         ui/class-card.tsx (an actions slot), ui/spots-badge.tsx
entity/account/          model.ts (AccountView)
feature/book-class/      server/action.ts (roleAction('user'), updateTag('class')),
                         ui/book-button.tsx
feature/publish-class/   model.ts (zPublishClassBody extended), server/action.ts,
                         ui/publish-class-form.tsx
feature/auth/            server/action.ts (signIn, signUp, signOut), ui/credentials-form.tsx,
                         ui/user-menu-items.tsx
widget/schedule/         ui/schedule.tsx (awaits connection(), then getSchedule and readSession,
                         grouped by day into ClassCard with BookButton),
                         ui/schedule-skeleton.tsx
app/(site)/page.tsx                       PageHeader + Suspense(Schedule)
app/(site)/(staff)/class/new/page.tsx     PageHeader + PublishClassForm
app/(auth)/sign-in/page.tsx               AuthCard + CredentialsForm
```

What changes in each slice:

- `book-class` loses its narrowing helpers and status switch; its copy table remains.
- `publish-class`'s action shrinks to its schema, one call and one tag.
- Both forms lose their plumbing.
- The schedule's render slot moves from `page.tsx` into the widget, where it belongs.

The action, and the leaf that uses it:

```ts
'use server'

export const bookClass = roleAction('user')
  .inputSchema(zBookClassBody)
  .action(async ({ parsedInput, ctx }) => {
    await call(ctx.api.POST('/api/booking', { body: parsedInput }), BOOK_COPY)
    updateTag('class')
  })
```

```tsx
'use client'

export function BookButton({ classId, name }: { classId: string; name: string }) {
  const { executeAsync, isPending } = useAction(bookClass)
  async function book() {
    const result = await executeAsync({ classId })
    if (result?.serverError) toast.error(result.serverError)
    else toast.success('Spot booked')
  }
  return (
    <Button onClick={book} disabled={isPending} aria-label={`Book ${name}`}>
      Book
    </Button>
  )
}
```

(`ctx.api` and the `call` signature are illustrative; the template's `AGENTS.md` shows the
shipped form.)
