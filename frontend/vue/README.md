# frontend/vue

Vue 3 single-page app on Vite: Vue Router 5 with explicit route tables, Pinia 4 setup stores, a
client, SDK and zod schemas generated from the server's OpenAPI contract (Hey API's fetch client),
forms on a composable over the generated zod schemas, Reka UI primitives styled by co-located SCSS
on a global token tree, vue-i18n, Vitest and Playwright with axe. When the stack's server has its `auth` flag on it
adds the session glue (same-origin HttpOnly cookies, one refresh on a 401, route guards, sign-in
and sign-up). Generated alone or as the `frontend` of the `vue-bun-express` or
`vue-python-fastapi` stack. The shape it follows is ADR 0008 and
`docs/conventions.md › Frontend, single-page app`. A generated app is a skip link, one `main` and
an index route of one `h1` and one line of copy: the header, navigation, footer and any status
screen are product code (ADR 0010, `base/AGENTS.md › The shell`).

## Flags

| Flag   | Default | What it adds                                                                                                   |
| ------ | ------- | -------------------------------------------------------------------------------------------------------------- |
| `i18n` | on      | English and Hebrew (RTL), a language toggle, a lazily loaded Hebrew copy table (vue-i18n stays in either mode) |
| `pwa`  | on      | Web manifest, icons, the Workbox service worker (`vite-plugin-pwa`), update and install prompts                |

## Layout

- `template.yaml`: the manifest (commands, contract, HTTP surface, flags). `onlyWhen` lists the
  files that exist only with a server (`server`: the generated client, its wrapper, interceptors,
  error models and stores, with the `api:types` script and `@hey-api/openapi-ts`), with the
  server's `auth` flag (`server:auth`) or `database` capability, and `// @server` and
  `// @server:auth` markers cover the lines inside shared files. A `.vue` file takes template block
  markers only, so no template file imports a file that exists only with a flag.
- `base/`: the files copied into the generated package, including `AGENTS.md`, `bun.lock` and, in a
  stack, the committed `src/services/generated/`. Its `src/` is `app/` (routes, nav table), `components/`
  (`app-main-layout`, `app-toast-host`, and the components a product places: `app-theme-toggle`,
  with the flags `app-account-menu`, `app-language-toggle`, `app-install-button`), `pages/`
  (`home/`, `not-found/`, and with auth `auth/`, `user/`, `forbidden/`), `shared/components/`
  (the `base-*` primitives and patterns, `page-container` among them), `store/`, `services/`.
- `base/Dockerfile`, `base/nginx/`: the `dist` and `serve` image targets and the nginx config
  template and headers snippet of the `split` mode.
- `compose.yaml`: the Compose service body, keyed by the package directory at generation and
  written per deploy mode (`single`: build-only, `split`: nginx on its own port).
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `split`, `python`,
  `alone`, `alone-lean`, `auth-off`, `postgres`, `i18n-off`, `pwa-off`, `flags-off`, `brand`).
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
Generated without a server, the package has no generated client, no `api:types` script and no
`/api` proxy (ADR 0011); the harness adds them with a server. A project generated with a server
regenerates the folder from that server's own contract.

## Deploy modes

`single`: the server serves `dist/` and `/api` on one port. `split`: this package's nginx serves
the files and proxies `/api/` to the server. The API is always reached at relative `/api`.

The layer map of the generated package is in `base/AGENTS.md`.
