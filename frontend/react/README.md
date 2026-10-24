# frontend/react

Vite and React 19 single-page app with React Router 8 in data mode, a typed API client generated
from the server's OpenAPI contract (`openapi-fetch` plus `openapi-typescript`), Tailwind CSS v4,
Vitest and Playwright with axe. Generated alone or as the `frontend` of the `react-python-fastapi`
stack. The shape it follows is ADR 0003 and `docs/conventions.md › Frontend, single-page app`.

## Layout

- `template.yaml`: the manifest (commands, contract, HTTP surface).
- `base/`: the files copied into the generated package, including `AGENTS.md`, `bun.lock` and
  the committed `src/lib/api/schema.d.ts`.
- `compose.yaml`: the Compose service body, keyed by the package directory at generation.
- `tests/cases.yaml`: the generated variants the catalog gates.
- `CHANGELOG.md`: version history.

## Commands

| Intent | Command |
| --- | --- |
| install | `bun install` |
| dev | `bun run dev` |
| check | `bun run check` |
| typecheck | `bun run typecheck` |
| lint | `bun run lint` |
| format | `bun run format` |
| test | `bun run test` |
| test (e2e) | `bun run test:e2e` |
| contract | `bun run api:types` |

## Contract

`bun run api:types` regenerates `src/lib/api/schema.d.ts` from the server's `openapi.json`.
Generated without a server, the package keeps the committed types (produced from
`server/python-fastapi`), so `check` still passes.

The layer map of the generated package is in `base/AGENTS.md`.
