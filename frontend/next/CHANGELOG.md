# Changelog

## 1.1.1 — unreleased

- Fix: the import zones in `eslint.config.mjs` are enforced. The last `no-restricted-imports` block (`src/**`) replaced the zone rules of the earlier blocks, so a cross-feature `ui/` import, `ui/` or `model.ts` importing `app/`, and `shared/` or `lib/` importing `feature/` or `app/` passed lint. The zones are now disjoint and each lists every restriction that applies to it.
- `tests/unit/eslint-zones.test.ts` lints one snippet per zone through the real config and fails if a zone stops being enforced.

## 1.1.0 — 2026-10-23

- The e2e API web server's command comes from the server package in the stack
  (`__SERVER_DEV_COMMAND__`), so the frontend runs against a server in any language. Alone it
  keeps `bun run dev`.

## 1.0.1 — 2026-10-22

- `AGENTS.md` gains the sections Adding a feature, Styling, Errors and Tests, the conventions an agent follows in this package.
- Harness-only remarks removed from the example env file, `globals.css` and `page.tsx`.

## 1.0.0 — 2026-10-22

Materialised from create-next-app@16.4.2 plus the fullstack-dev-harness `templates/frontend` overlay; lockfile and generated client types committed.
