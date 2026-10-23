# Changelog

## 1.1.0 — 2026-10-23

- The e2e API web server's command comes from the server package in the stack
  (`__SERVER_DEV_COMMAND__`), so the frontend runs against a server in any language. Alone it
  keeps `bun run dev`.

## 1.0.1 — 2026-10-22

- `AGENTS.md` gains the sections Adding a feature, Styling, Errors and Tests, the conventions an agent follows in this package.
- Harness-only remarks removed from the example env file, `globals.css` and `page.tsx`.

## 1.0.0 — 2026-10-22

Materialised from create-next-app@16.4.2 plus the fullstack-dev-harness `templates/frontend` overlay; lockfile and generated client types committed.
