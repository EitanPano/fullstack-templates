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

The generator copies each package's base, applies the flags, assembles the root
`docker-compose.yml`, installs dependencies, generates the contract and the client types,
and writes `.fullstack/catalog.yaml` recording what was generated and which commands to run.
Needs Bun 1.4+ and Node 24+.

With a database (needs Docker):

```sh
bun tools/generate.ts --stack next-bun-express --capability database=postgres \
  --out ../my-app --name my-app
cd ../my-app && docker compose up -d database
cd backend && bun run db:migrate && bun run test:db
```

The generator adds the Postgres service to the root `docker-compose.yml`, the `DATABASE_URL`
variable to the backend's `.env.example`, and the migration and test-database scripts.

## Templates

<!-- matrix:start -->
| Template | Kind | Version | Flags | Capabilities | Summary |
| --- | --- | --- | --- | --- | --- |
| `bun-express` | server | 2.1.0 | auth | database | Layered Express 5 API on Bun: zod schemas, OpenAPI from them, auth, jobs and a bus |
| `next` | frontend | 1.0.1 | — | — | Next.js 16 App Router with a typed client generated from the server's contract |

| Stack | Packages | Summary |
| --- | --- | --- |
| `next-bun-express` | `server/bun-express`, `frontend/next` | Next.js 16 in front of Express 5 on Bun |
<!-- matrix:end -->

## How a template is built

Each template lives in `<kind>/<id>/` and is described by a `template.yaml` manifest:

- `id`, `kind` (server, frontend or worker), `version` and `summary`;
- `flags`: boolean choices, each with a `default` and the `onlyPaths` removed when off
  (plus dependencies to drop);
- `commands`: the vocabulary the agents use (`install`, `check`, `test`, `contract`, ...);
- `contract`: what the package produces (an OpenAPI document) or consumes;
- `postGenerate`: the commands run in order after generation, such as `install`, `contract`.

`base/` is a complete, runnable package with its lockfile committed. Markers such as
`@auth` and `@noauth` keep or drop lines and blocks in the file's own comment syntax;
`__PROJECT_NAME__`-style placeholders are substituted in text files. Capabilities
(database, cache, messaging) are provider overlays: a template's `capabilities/<kind>/<provider>/`
holds the files copied over the base and the scripts and commands they add, and the provider's
Compose service and env contract in `shared/providers/` are wired into the project root.
`bun-express` ships `database/postgres`. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/capabilities.md](docs/capabilities.md).

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
- Next: `server/python-fastapi` and `frontend/react`, then mongodb, redis, and a worker with
  rabbitmq.

The design is in [ADR 0001](docs/adr/0001-catalog-architecture.md).

## License

MIT, see [LICENSE](LICENSE).
