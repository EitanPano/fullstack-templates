# frontend/angular

Angular 22 single-page app on standalone components and signals: `@ngrx/signals` stores, typed
forms over zod schemas, co-located SCSS on a global token tree, a typed client, SDK and zod schemas generated from the server's
OpenAPI contract (Hey API's Angular client), Vitest through `ng test` and Playwright with axe. When
the stack's server has its `auth` flag on it adds the session glue (same-origin HttpOnly cookies, one
refresh on a 401, route guards, sign-in and sign-up). Generated alone or as the `frontend` of the
`angular-bun-express` or `angular-python-fastapi` stack. The shape it follows is ADR 0006 and
`docs/conventions.md`. The app is a skip link, one `main` and an index route of one `h1`: no header,
navigation, footer or example screen (ADR 0010); the product builds its chrome.

## Flags

| Flag   | Default | What it adds                                                                   |
| ------ | ------- | ------------------------------------------------------------------------------ |
| `i18n` | on      | Transloco, English and Hebrew (RTL), a language toggle, copy loaded at runtime |
| `pwa`  | on      | Web manifest, icons, the Angular service worker, update and install prompts    |

## Layout

- `template.yaml`: the manifest (commands, contract, HTTP surface, flags). `onlyWhen` lists the
  files that exist only with the server's `auth` flag (`server:auth`) or `database` capability, and
  `// @server:auth` markers cover the lines inside shared files.
- `base/`: the files copied into the generated package, including `AGENTS.md`, `bun.lock` and the
  committed `src/app/services/generated/`. Its `src/app/components/` holds the two layouts and the
  components the product places: `app-theme-toggle`, with auth `app-account-menu`, with `i18n`
  `app-language-toggle`, with `pwa` `app-install-button` and `app-install-hint`.
- `base/Dockerfile`, `base/nginx/`: the `dist` and `serve` image targets and the nginx config
  template and headers snippet of the `split` mode.
- `compose.yaml`: the Compose service body, keyed by the package directory at generation and written
  per deploy mode (`single`: build-only, `split`: nginx on its own port).
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

`bun run api:types` regenerates `src/app/services/generated/` from the server's `openapi.json`.
Generated without a server, the package keeps the committed output (produced from
`server/python-fastapi` with `auth` on), so `check` still passes. A project generated with a server
regenerates it from that server's own contract.

## Deploy modes

`single`: the server serves `dist/` and `/api` on one port. `split`: this package's nginx serves the
files and proxies `/api/` to the server. The API is always reached at relative `/api`.

The layer map of the generated package is in `base/AGENTS.md`.
