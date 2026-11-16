# fullstack/astro-cloudflare-pages

One package on Cloudflare Pages: static Astro pages and Pages Functions on one origin, D1 through
Drizzle, zod schemas shared by the pages and the functions, one error envelope, tests in `workerd`.
No Docker anywhere: generation, gates and the local database run without it, and no account is
needed. The shape is [ADR 0014](../../docs/adr/0014-astro-cloudflare-pages.md). Generated alone
(`--template fullstack/astro-cloudflare-pages`) or as the one package of the
`astro-cloudflare-pages` stack, in `app/`.

This version (1.0.0) is the skeleton and its server half: the request flow, the reference
`module`, health, the rate limiter and the gates. The page half, auth, jobs and islands arrive in
later minors.

## Layout

- `template.yaml`: the manifest (commands, the HTTP surface, `lanes`: which role writes which
  path).
- `base/`: the files copied into the generated package, including `AGENTS.md` (the layer map, the
  request flow, the import rules, the recipes) and `bun.lock`.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `brand`).

## What a generated app is

A skip link, one `main` and an index route of one `h1`. Behind `/api`: `GET /api/health`,
`GET /api/health/ready` (pings D1), and the reference module (`/api/module`, `/api/module/{id}`)
that `base/AGENTS.md › Adding a module` tells the reader to copy.

- **Request flow.** `functions/_middleware.ts` runs the root middleware around every function (request
  id, error envelope, response headers, one JSON log line); a route file is its gate chain and one
  controller call; `server/` uses only `Request`, `Response` and the bindings type.
- **Data.** Drizzle on D1, SQL migrations in `migrations/`, rate-limit counters in a table hit by
  one upsert per check.
- **Gates.** `bun run check`: `wrangler types --check`, `astro check`, `tsc` (server and tests),
  ESLint (import zones), Prettier and every test. `bun run test:db` runs the `workerd` API project
  alone.
- **Run it.** `bun run migrate`, then `bun run dev` (Astro on 4321, `/api` proxied to
  `wrangler pages dev`) or `bun run build` and `bun run start` (everything on 8788, on the e2e state
  folder rebuilt by `bun run e2e:db`).

## Versions

Astro 7, Wrangler 4, Vitest 4 with `@cloudflare/vitest-plugin`, Drizzle ORM 0.45 and drizzle-kit
0.31, zod 4, ESLint 10, TypeScript 6 (`astro check` refuses 7).
