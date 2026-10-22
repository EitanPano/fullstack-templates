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

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
