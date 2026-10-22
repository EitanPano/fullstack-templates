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
6. Configuration comes only through `src/env.ts`. A browser-visible value is `NEXT_PUBLIC_*`,
   declared in a separate public schema, and listed in the package's example env file.

## Styling

- Tailwind utility classes only: no new `.css` files beyond `src/app/globals.css`, no inline
  styles.
- Design tokens are CSS variables in `:root` in `globals.css`, exposed to utilities through
  `@theme inline`. Add a token there instead of a literal colour or size in a component.
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
- Every new behaviour gets a test for the happy path and at least one for a failure or empty
  path. No `.skip` or `.only`; a removed test is named in the stage report.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
