# frontend/next

Next.js 16 App Router with a typed API client, SDK and zod schemas generated from the server's
OpenAPI contract (Hey API), server actions on next-safe-action, forms on React Hook Form, Cache
Components, date helpers on `date-fns`, and, when the stack's server has its `auth` flag on, the
session glue (HttpOnly cookies, `proxy.ts` refresh, sign-in and sign-up). Tailwind CSS v4, shadcn/ui,
Vitest and Playwright with axe. Generated alone or as the `frontend` of the `next-bun-express`
stack.

## Layout

- `template.yaml`: the manifest (commands, contract, HTTP surface).
- `base/`: the files copied into the generated package, including `AGENTS.md`, `bun.lock` and
  the committed `src/shared/api/generated/`. `onlyWhen` in the manifest lists the files that exist
  only with the server's `auth` flag (`server:auth`), and `// @server:auth` markers cover the lines
  inside shared files.
- `compose.yaml`: the Compose service body, keyed by the package directory at generation.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `auth-off` and
  `stack-postgres` in the `next-bun-express` stack, `python` in `next-python-fastapi`, and `alone`).
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

`bun run api:types` (Hey API, `base/openapi-ts.config.ts`) regenerates `src/shared/api/generated/` from the server's `openapi.json`.
Generated without a server, the package keeps the committed output, so `check` still passes.

The layer map of the generated package is in `base/AGENTS.md`.
