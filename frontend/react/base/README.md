# Frontend

Vite, React 19 and React Router 8 in data mode. The stack, commands, directory layout and
definition of done are in the repository's `AGENTS.md`; nothing here repeats them.

- `bun run dev` starts the dev server on port 5173 and proxies `/api` to the API
  (port `__SERVER_PORT__`).
- `bun run build` writes the static app to `dist/`.
- `bun run check` runs every gate; `bun run test:e2e` runs Playwright.
- `bun run api:types` regenerates `src/lib/api/schema.d.ts` from `../__SERVER_DIR__/openapi.json`.

`AGENTS.md` in this directory ships with the package and holds its layer map.
