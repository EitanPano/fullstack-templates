# frontend/react

Vite and React 19 single-page app: React Router 8 in data mode with lazy pages, Redux Toolkit with
RTK Query over a typed client, SDK and zod schemas generated from the server's OpenAPI contract (Hey
API), forms on React Hook Form, date helpers on `date-fns`, Radix primitives styled by a global SCSS
tree, Vitest and Playwright with axe and, when the stack's server has its `auth` flag on, the
session glue (same-origin HttpOnly cookies, one refresh on a 401, route guards, sign-in and
sign-up). Generated alone or as the `frontend` of the `react-python-fastapi` or `react-bun-express`
stack. The shape it follows is ADR 0007 and `docs/conventions.md › Frontend, single-page app`.

## Layout

- `template.yaml`: the manifest (commands, contract, HTTP surface).
- `base/`: the files copied into the generated package, including `AGENTS.md`, `bun.lock` and
  the committed `src/services/generated/`. `onlyWhen` in the manifest lists the files that exist
  only with the server's `auth` flag (`server:auth`) or `database` capability, and
  `// @server:auth` markers cover the lines inside shared files.
- `base/Dockerfile`, `base/nginx/`: the `dist` and `serve` image targets and the nginx config
  template and headers snippet of the `split` mode.
- `compose.yaml`: the Compose service body, keyed by the package directory at generation and
  written per deploy mode (`single`: build-only, `split`: nginx on its own port).
- `tests/cases.yaml`: the generated variants the catalog gates.
- `CHANGELOG.md`: version history.

## Commands

| Intent     | Command             |
| ---------- | ------------------- |
| install    | `bun install`       |
| dev        | `bun run dev`       |
| check      | `bun run check`     |
| typecheck  | `bun run typecheck` |
| lint       | `bun run lint`      |
| format     | `bun run format`    |
| test       | `bun run test`      |
| test (e2e) | `bun run test:e2e`  |
| contract   | `bun run api:types` |

## Contract

`bun run api:types` regenerates `src/services/generated/` from the server's `openapi.json`.
Generated without a server, the package keeps the committed output (produced from
`server/python-fastapi` with `auth` on), so `check` still passes. A project generated with a server
regenerates it from that server's own contract.

## Deploy modes

`single`: the server serves `dist/` and `/api` on one port. `split`: this package's nginx serves the
files and proxies `/api/` to the server. The API is always reached at relative `/api`.

The layer map of the generated package is in `base/AGENTS.md`.
