# fullstack-templates

A catalog of runnable, architecture-first project templates (servers, frontends, later
workers) with selectable providers (database, cache, messaging), a generator, and CI that
proves every listed template generates and passes its own gates. It is for developers who
want a new project whose layers, import rules and contract are already in place. Use it on
its own, or through [fullstack-dev-harness](https://github.com/EitanPano/fullstack-dev-harness),
which fetches a pinned version of this catalog and drives the generator.

![test-generated](https://github.com/EitanPano/fullstack-templates/actions/workflows/test-generated.yml/badge.svg)

## Generate a project in sixty seconds

```sh
git clone https://github.com/EitanPano/fullstack-templates
cd fullstack-templates/tools && bun install && cd ..
bun tools/generate.ts --stack next-bun-express --out ../my-app --name my-app
cd ../my-app/backend && bun run check
cd ../frontend && bun run check
```

The same project with a FastAPI server on Python 3.14 behind the same frontend:

```sh
bun tools/generate.ts --stack next-python-fastapi --out ../my-app --name my-app
cd ../my-app/backend && uv run poe check
cd ../frontend && bun run check
```

A React single-page app (Vite, React Router) instead of Next.js, in front of either server:

```sh
bun tools/generate.ts --stack react-python-fastapi --out ../my-app --name my-app
cd ../my-app/backend && uv run poe check
cd ../frontend && bun run check
```

`react-bun-express` is the same frontend over Express on Bun. The Next.js stacks are
`next-bun-express` and `next-python-fastapi`.

The generator copies each package's base, applies the flags, assembles the root
`docker-compose.yml`, installs dependencies, generates the contract and the client types,
and writes `.fullstack/catalog.yaml` recording what was generated and which commands to run.
Needs Bun 1.4+, Node 24+ and git, plus uv 0.12.23 or later, below 0.14 (which installs Python 3.14) for a Python
package. The generator checks the tools a template declares before it starts.

With a database (needs Docker):

```sh
bun tools/generate.ts --stack next-bun-express --capability database=postgres \
  --out ../my-app --name my-app
cd ../my-app && docker compose up -d --wait database
cd backend && bun run db:migrate && bun run test:db
```

The generator adds the Postgres service to the root `docker-compose.yml`, the `DATABASE_URL`
variable to the backend's `.env.example`, and the migration and test-database scripts. With
`next-python-fastapi` the backend commands are `uv run poe migrate` and `uv run poe test-db`.

To run the full stack (`docker compose --profile app up --build`), export `DATABASE_URL` first:
it is a secret with no default in Compose, and the backend runs in production mode
(`NODE_ENV: production`, or `APP_ENV: production` for FastAPI).
The server does not migrate on boot: the one-shot `backend-migrate` service runs first and the
backend starts only after it succeeds, so `up --build` applies the migrations before the backend
serves. `docker compose --profile app run --rm backend-migrate` runs it alone, with the
production secrets and `DATABASE_URL` exported, as the app needs; `bun run db:migrate` (or
`uv run poe migrate`) stays for local development. The bundled `database` service is the local
stack; production does not refuse its credentials if you export them.

## Deploy modes

A project with a server and a frontend ships in one of two modes, chosen with
`--deploy single|split` and recorded in `.fullstack/catalog.yaml`. `single` puts the server and a
single-page app's built files in one image on one port, with no CORS; it is the default for a
React stack and needs Docker Compose 2.35.0 or later. `split` gives each package its own image and
puts the frontend in front. Next.js stacks are always `split`. See
[docs/conventions.md › Deploy modes](docs/conventions.md) and
[ADR 0003](docs/adr/0003-spa-and-deploy-modes.md).

## Templates

<!-- matrix:start -->
| Template | Kind | Version | Flags | Capabilities | Summary |
| --- | --- | --- | --- | --- | --- |
| `bun-express` | server | 2.4.0 | auth | database | Layered Express 5 API on Bun: zod schemas, OpenAPI from them, auth, jobs and a bus |
| `python-fastapi` | server | 1.2.0 | auth | database | Layered FastAPI API on Python 3.14 and uv: pydantic models, OpenAPI from them, one error envelope |
| `next` | frontend | 2.0.1 | — | — | Next.js 16 App Router with a typed client generated from the server's contract |
| `react` | frontend | 2.0.1 | — | — | Vite and React 19 single-page app on the frontend foundation: React Router data mode, shadcn/ui, TanStack Query and a client generated from the server's contract |

| Stack | Packages | Summary |
| --- | --- | --- |
| `next-bun-express` | `server/bun-express`, `frontend/next` | Next.js 16 in front of Express 5 on Bun |
| `next-python-fastapi` | `server/python-fastapi`, `frontend/next` | Next.js 16 in front of FastAPI on Python 3.14 |
| `react-bun-express` | `server/bun-express`, `frontend/react` | React 19 (Vite) in front of Express 5 on Bun |
| `react-python-fastapi` | `server/python-fastapi`, `frontend/react` | React 19 (Vite) in front of FastAPI on Python 3.14 |
<!-- matrix:end -->

## How a template is built

Each template lives in `<kind>/<id>/` and is described by a `template.yaml` manifest:

- `id`, `kind` (server, frontend or worker), `version` and `summary`;
- `flags`: boolean choices, each with a `default` and the `onlyPaths` removed when off
  (plus dependencies to drop);
- `commands`: the vocabulary the agents use (`install`, `check`, `test`, `contract`, ...);
- `contract`: what the package produces (an OpenAPI document) or consumes;
- `tools`: the programs it needs and their minimum versions, checked before generation;
- `dependencies`: the manifest and its adapter (`npm` or `pyproject`);
- `postGenerate`: the commands run in order after generation, such as `install`, `contract`;
- `dropAfterPostGenerate`: paths removed from the package afterwards (a Python `.venv`).

`base/` is a complete, runnable package with its lockfile committed. Markers such as
`@auth` and `@noauth` keep or drop lines and blocks in the file's own comment syntax;
`__PROJECT_NAME__`-style placeholders are substituted in text files. Capabilities
(database, cache, messaging) are provider overlays: a template's `capabilities/<kind>/<provider>/`
holds the files copied over the base and the scripts and commands they add, and the provider's
Compose service and env contract in `shared/providers/` are wired into the project root.
`bun-express` and `python-fastapi` ship `database/postgres`. A frontend that declares a `static`
build output (`react`) can be served by a server's image; `next` cannot. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/capabilities.md](docs/capabilities.md).

## Architecture contract

[docs/conventions.md](docs/conventions.md) states the contract per kind of template. The
idea: every server has the same directories, the same request flow and the same rules in
every language, and each language's own tooling enforces them (ESLint import zones for
TypeScript, import-linter for Python, ArchUnit for Java), so an agent working in any
template finds the same shape.

## Status and roadmap

- v0.1.0: the `server/bun-express` and `frontend/next` templates, the `next-bun-express`
  stack, the `validate`, `generate` and `test-generated` tools, and CI.
- v1.0.0: the first capability, `database/postgres` for `bun-express` 2.1.0, with the
  mechanism proven end to end: provider and overlay manifests, capability selection, root
  assembly of the Compose service and env, and `test-generated --with-services`.
- v1.1.0: `server/python-fastapi` 1.0.0 on Python 3.14 and uv, with its `database/postgres`
  overlay, and the `next-python-fastapi` stack. The machinery stops assuming npm: a `pyproject`
  dependency adapter, tree hygiene and a tools preflight. Compose gets a derived one-shot migrate
  service, the base files an overlay shadows are pinned, and CI installs uv and smoke-tests the
  built images in Compose. `bun-express` is 2.2.0 and `frontend/next` 1.1.0.
- v1.2.0: `frontend/react` 1.0.0 (Vite, React 19 and React Router 8 in data mode), the
  `react-bun-express` and `react-python-fastapi` stacks, and the `single` and `split` deploy modes
  ([ADR 0003](docs/adr/0003-spa-and-deploy-modes.md)). Both servers serve a built single-page app
  behind `STATIC_DIR` (`bun-express` 2.3.0, `python-fastapi` 1.1.0), `generate` gains `--deploy`,
  the app smoke runs per mode with the e2e suite against the container, and `frontend/next` 1.1.1
  enforces its ESLint import zones.
- v1.3.0: the UI baseline ([ADR 0004](docs/adr/0004-ui-baseline.md)). `frontend/react` 1.1.0 and
  `frontend/next` 1.2.0 ship an app shell, a button, token scales and a `phone` e2e project;
  `python-fastapi` 1.1.1 and `bun-express` 2.3.1 key `by_ip` on the /64 network for IPv6.
- v1.4.0: the frontend foundation ([ADR 0005](docs/adr/0005-frontend-foundation.md)).
  `frontend/next` 2.0.0 and `frontend/react` 2.0.0 are breaking restructures: layers enforced by
  lint, a shadcn/ui design system, a Hey API client, safe mutations and forms, the auth screens
  and an e2e suite against a fresh API and its own database. `generate` gains the brand options;
  `bun-express` 2.4.0 and `python-fastapi` 1.2.0 add `start`, `RATE_LIMIT_SCALE` and `e2eDb`.
- Next: mongodb, redis, and a worker with rabbitmq.

The design is in [ADR 0001](docs/adr/0001-catalog-architecture.md).

## License

MIT, see [LICENSE](LICENSE).
