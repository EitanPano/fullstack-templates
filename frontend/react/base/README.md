# Frontend

Vite, React 19, React Router 8 in data mode, Redux Toolkit with RTK Query and co-located SCSS on a global token tree.
The stack, commands, directory layout and definition of done are in the repository's
`AGENTS.md`; nothing here repeats them.

- `bun run dev` starts the dev server on port 5173 and proxies `/api` to the API <!-- @server -->
  (port `__SERVER_PORT__`). <!-- @server -->
- `bun run dev` starts the dev server on port 5173. <!-- @noserver -->
- `bun run build` writes the static app to `dist/`; `bun run preview` serves it on the same port <!-- @server -->
  with the same `/api` proxy (the e2e suite runs it). <!-- @server -->
- `bun run build` writes the static app to `dist/`; `bun run preview` serves it on the same port <!-- @noserver -->
  (the e2e suite runs it). <!-- @noserver -->
- `bun run check` runs every gate; `bun run test:e2e` runs Playwright on a phone and a desktop
  project against the production build.
- `bun run api:types` regenerates `src/services/generated/` from `../__SERVER_DIR__/openapi.json`. <!-- @server -->

`AGENTS.md` in this directory ships with the package and holds its layer map.
