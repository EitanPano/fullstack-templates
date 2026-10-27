# Frontend

Next.js 16 App Router. The stack, commands, directory layout and definition of done are in
the repository's `AGENTS.md`; nothing here repeats them.

- `bun run dev` starts the dev server on port 3000 and expects the API on `API_URL`
  (see `.env.example`).
- `bun run check` runs every gate; `bun run test:e2e` runs Playwright.
- `bun run api:types` regenerates `src/shared/api/generated/` from `../__SERVER_DIR__/openapi.json`.

`AGENTS.md` in this directory ships with the package and holds its layer map. Next.js appends
its own section on the first `dev` run; read that section before touching framework APIs.
