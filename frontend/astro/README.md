# frontend/astro

An Astro 7 static site: pages and an Astro component kit on co-located SCSS over a global token tree,
a Content-Security-Policy with no `'unsafe-inline'` (Astro hashes every script and style of the build
into a `<meta>` on each page), a client, SDK and zod schemas generated from the server's OpenAPI
contract (Hey API's fetch client), Vitest and Playwright with axe. It ships no image (`docker:
false`, [ADR 0014](../../docs/adr/0014-astro-cloudflare-pages.md) K3): the build output is static
HTML for any static host, or for the `serverless/cloudflare` package of the `astro-cloudflare` stack,
which serves it with its functions on one origin. Generated alone or as the `frontend` of that stack.
The ten frontend invariants hold ([docs/conventions.md](../../docs/conventions.md)); invariant 9 is
read as ADR 0014 K3 says. A generated site is a skip link, one `main` and an index route of one `h1`
and one line of copy, with a 404 page: the header, navigation and footer are product code
([ADR 0010](../../docs/adr/0010-no-chrome-no-example-screen.md)). It has no accounts and no example
screen, and no page calls the API.

## Flags

| Flag      | Default | What it adds                                                                                                                  |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `islands` | off     | `@astrojs/react`, `react` and `react-dom`, the integration line and the `src/components/islands/` convention; no island ships |

## Layout

- `template.yaml`: the manifest (commands, contract, HTTP surface, the `islands` flag). `onlyWhen`
  lists what exists only with a server (`server`: the generated client and its configuration, the
  wrapper, the envelope's models, copy lookup and form helper, the `api:types` script and
  `@hey-api/openapi-ts`), and `// @server` markers cover the lines inside shared files (an `.astro`
  file takes `//` in its frontmatter and `<!-- -->` in its markup). A site generated alone is a
  subset of the same site in its stack.
- `base/`: the files copied into the generated package, including `AGENTS.md`, `bun.lock` and, in a
  stack, the committed `src/services/generated/`. Its `src/` is `pages/`, `layouts/`, `components/`
  (`ui/`, the kit), `services/`, `models/` (one folder per noun), `styles/` and `nav.ts`; `public/`
  holds `theme-init.js`, the favicon and the host's own files.
- `tests/cases.yaml`: the generated variants the catalog gates (`default`, `alone`, `islands`,
  `jobs`, `brand`).
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

`bun run api:types` regenerates `src/services/generated/` from the server's `openapi.json`. Generated
without a server, the package has no generated client, no `api:types` script and no `/api` proxy
([ADR 0011](../../docs/adr/0011-frontend-without-a-server.md)).

## E2E

`bun run test:e2e` builds, then runs Playwright on `phone` and `desktop`. Alone, the web server is
`astro preview` on port 4321. In the stack it is the functions package's own chain (`e2eDb`, then
`start`, which assembles this build with the functions) with the rate limits scaled, and the base URL
is that origin.

The layer map of the generated package, where each addition goes, the recipe for a content page and
a content collection, and the recipe that migrates a hand-written static site into Astro (with and
without the functions package) are in `base/AGENTS.md`.
