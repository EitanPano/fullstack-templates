The layer map of this package. Commands are in `package.json`; the contract types are generated, never edited.

**`src/`**

- `app/`: routing only. `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`,
  `not-found.tsx`. A page composes feature components and calls feature loaders. No fetch
  calls and no business logic in `app/`.
- `feature/<name>/`: one directory per product feature, singular name. `ui/` holds the
  components, `server/` holds loaders and server actions that call the API client,
  `model.ts` holds types and form schemas.
- `shared/`: `ui/` primitives and `lib/` utilities. Product-agnostic; never imports
  `feature/`.
- `lib/api/`: `client.ts` (`createApi` and the default `api`, both `openapi-fetch`) and
  `schema.d.ts` (generated; never edited by hand). Only `feature/*/server/` imports the
  client.
- `shared/lib/action.ts`: `ActionResult`, what every server action returns.
- `env.ts`: the only file that reads `process.env`, parsed with zod. Browser-visible values
  are `NEXT_PUBLIC_*` and nothing else.

Import direction: `app → feature → shared, lib`. Never the reverse. A feature never imports
another feature's `ui/`; lift to `shared/` or pass props. Server Components are the
default; `'use client'` goes only on leaf components that need state, effects or browser
APIs. Data reaches client components through props or server actions, never through
`fetch` in the browser. A server action validates, calls the API, calls `revalidatePath`
or `revalidateTag` for what it changed, and returns an `ActionResult` that the client leaf
shows with `sonner`.

Lint enforces the direction, the client rule and the `env.ts` rule, and `tests/unit/eslint-zones.test.ts`
seeds one violation per zone. A relative import of another feature's `ui/` is flagged only from a file 1 to 3
directories below `feature/<name>/` (2 to 4 levels of `../`); a file nested deeper, or one directly in
`feature/<name>/`, is not covered. Use the `@/` alias for every import that crosses a directory
(`@/shared/ui/...`, `@/lib/...`), and keep relative imports inside one feature. `@/feature/<name>/ui/...` is
flagged at any depth, and also for a feature's own `ui/`.

## Adding a feature

1. Create `src/feature/<name>/` (singular) with `model.ts` (types, form schemas), `server/`
   (loaders and server actions) and `ui/` (components). `server/` is the only place that
   imports `@/lib/api/client`; lint enforces it. `src/feature/health/` is the worked example.
2. If the server's contract changed, run `bun run api:types`. `src/lib/api/schema.d.ts` is
   generated and never edited by hand.
3. Components are Server Components. Add `'use client'` only to a leaf that needs state,
   effects or browser APIs, and pass it data and server actions as props.
4. A loader runs on the server and returns a value for an expected failure (see Errors). A
   server action validates its input, calls the API, calls `revalidatePath` or
   `revalidateTag` for what it changed, and returns an `ActionResult`.
5. Add the route in `src/app/<route>/`: a `page.tsx` that composes the feature and nothing
   else, plus `loading.tsx` and `error.tsx` for the new segment.
6. When the feature adds a top-level screen, add its nav entry to `src/app/nav.ts`.
7. Configuration comes only through `src/env.ts`. A browser-visible value is `NEXT_PUBLIC_*`,
   declared in a separate public schema, and listed in the package's example env file.

## Styling

- Tailwind utility classes only: no new `.css` files beyond `src/app/globals.css`, no inline
  styles.
- Design tokens are CSS variables in `globals.css`: colours in `:root` plus `@theme inline`,
  type, radius and shadow in a plain `@theme` block. Add a token there instead of a literal
  colour or size in a component.
- Four scales, all in `globals.css`; a component uses the utility, never the variable or a
  literal:
  - Colour: `background`, `foreground`, `muted`, `muted-foreground`, `border`, `primary`,
    `primary-foreground`, `ring`, `input` (`bg-primary`, `text-muted-foreground`), each with a dark
    value. `border` is for separators; a form control's outline uses `input` (3:1 against the
    background).
  - Spacing, 4 px base: Tailwind's default `--spacing: 0.25rem` multiplier, so `p-1` is 4 px,
    `p-2` 8, `p-3` 12, `p-4` 16, `p-6` 24, `p-8` 32, `p-12` 48, `p-16` 64. Do not add a
    `--spacing-<n>` key: it replaces the default step behind `p-<n>` and moves every
    existing use. A value off the scale is a new token by plan.
  - Type: `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, each with its
    `--text-<size>--line-height`.
  - Radius `rounded-sm` 4 px, `rounded-md` 8 px, `rounded-lg` 12 px; shadow `shadow-1`,
    `shadow-2`. Type, radius and shadow are declared in the plain `@theme` block, which emits
    them as variables. They live in `@theme`, not in `:root` plus `@theme inline`, because a
    same-named `:root` variable inside `@theme inline` would be circular.
- Mobile first: unprefixed utilities are the phone layout; `sm:` (640 px), `md:` (768 px) and `lg:` (1024 px) widen it.
  No page scrolls horizontally at any width.
- Buttons, nav links and form controls are at least 44 x 44 px. `src/shared/ui/button.tsx`
  is the one button; a denser layout gets a responsive variant, not a smaller control.
- The shell is `src/shared/ui/app-shell.tsx`, composed by `src/app/layout.tsx` from the table in
  `src/app/nav.ts`: a skip link, a `header` with the project name and `nav` named Primary, the
  page's one `main` (`id="main"`) and a `footer`. The layout owns `main`: a page, `loading.tsx`,
  `error.tsx` and `not-found.tsx` render inside it and never add a landmark set. A feature adds
  its entry to `nav.ts`. A product may restyle the shell by plan; the landmarks, the skip link
  and exactly one `main` stay.
- Toasts use `sonner`: concise and action-oriented ("Status refreshed", not "Operation
  completed successfully"). Icons come from `lucide-react`, the same icon for the same
  concept everywhere, with `aria-hidden` when a text label sits next to it.
- Use semantic HTML, labelled controls and keyboard-reachable interactions. The target is
  WCAG 2.2 AA, checked by the axe scan in the e2e tests.

## Errors

- Every new route segment gets an `error.tsx` (a Client Component, see `src/app/error.tsx`) and
  the root has `not-found.tsx`. Their messages are user-safe: no stack trace, no query text,
  no internal URL or secret. The cause stays in the server log.
- A loader catches an expected failure (the API answers with an error status, or is
  unreachable), logs the cause with `console.error`, and returns a value the UI renders, as
  `getHealth` does with `reachable: false`. An unexpected error is thrown and reaches the
  nearest `error.tsx`.
- Every server action returns `ActionResult` from `src/shared/lib/action.ts`:
  `{ ok: true, data }` or `{ ok: false, error }`. The client leaf shows the outcome with
  `toast.success` or `toast.error`, as `RefreshButton` does; expected failures are values,
  never exceptions.
- The client from `@/lib/api/client` is `openapi-fetch`: it does not throw on an HTTP error
  status, it returns `{ data, error, response }`. Check `data === undefined` and map the
  status to a message the user can act on; a network failure throws, so wrap it in `try`.

## Tests

- Unit tests live in `tests/unit/` and run with `bun run test` (Vitest, React Testing
  Library, jsdom). Components: props in, roles and text out, with `userEvent` for input.
  Loaders and actions run with the API stubbed through `vi.stubGlobal('fetch', ...)`; no
  test starts the server. `server-only` is aliased to `tests/stub/server-only.ts` in
  `vitest.config.mts` so server code can be imported.
- E2E tests live in `tests/e2e/` (Playwright with `@axe-core/playwright`): one test per user
  journey, each with an axe scan. `bun run test:e2e` starts the server and this app through
  the `webServer` entries in `playwright.config.ts`. Install the browser once with
  `bun x playwright install chromium` (add `--with-deps` on Linux).
- Playwright has two projects: `chromium` (desktop) and `phone` (`Pixel 7`, screenshots on).
  Every spec and its axe scan run on both. The phone project writes one screenshot per test
  under `test-results/`; QA reads them as the evidence of how the product looks.
  `tests/e2e/shell.spec.ts` holds the shell checks (landmarks, skip link, no horizontal
  overflow, 44 px targets).
- When the project has a database, the e2e server uses the development database: start it
  (`docker compose up -d --wait <service>` at the project root) and run the server package's
  `migrate` before `bun run test:e2e`.
- A journey creates its data through the API with a name unique per run, removes it through
  the API once the product has a delete endpoint, and never takes the development database's
  contents as a precondition.
- Every new behaviour gets a test for the happy path and at least one for a failure or empty
  path. No `.skip` or `.only`; a removed test is named in the stage report.

## Deployment

Next is always deployed `split`: `--deploy single` is refused for this template because it declares no
`static` output, and a Next stack records `deploy: split` in provenance. The package has no `STATIC_DIR`,
and it is not served by the server.

- **Image.** Multi-stage `Dockerfile`: a frozen install, `bun run build`, then only Next's
  standalone output, its static files and `public/` are copied. The container runs as the
  non-root `node` user and listens on `3000`.
- **Compose service.** The root `docker-compose.yml` builds the package from its `Dockerfile`
  under the `app` profile, so `docker compose --profile app up --build` starts it. With a server
  in the plan it gets `API_URL` (the server's name and port on the Compose network) and waits
  for the server. Stop it with `docker compose --profile app down`: a plain `down` does not see
  profile services.
- **Port.** Published as `3000:3000` on every interface: this container is the public edge, and
  the server behind it is published on loopback only. API calls are made by the Next.js server
  through `API_URL`, not by the browser.
- **`TRUST_PROXY`.** Not read here. The server's Compose service defaults it to `1` because this
  server counts as the one proxy hop in front of it. Anything placed in front of this container
  adds a hop: raise the server's `TRUST_PROXY` to match.
- **`STATIC_DIR`.** Leave it unset on the server: it serves the API only.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
