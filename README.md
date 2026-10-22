# fullstack-templates

A catalog of runnable, architecture-first project templates (servers, frontends, workers)
with selectable providers (database, cache, messaging), a generator, and CI that proves
every listed template generates and passes its own gates.

Consumed by [fullstack-dev-harness](https://github.com/EitanPano/fullstack-dev-harness),
usable on its own.

Status: design accepted, first templates landing. The architecture is in
[docs/adr/0001-catalog-architecture.md](docs/adr/0001-catalog-architecture.md).

## Templates

<!-- matrix:start -->
| Template | Kind | Version | Flags | Capabilities | Summary |
| --- | --- | --- | --- | --- | --- |
| `bun-express` | server | 1.0.0 | auth | — | Layered Express 5 API on Bun: zod schemas, OpenAPI from them, auth, jobs and a bus |
| `next` | frontend | 1.0.0 | — | — | Next.js 16 App Router with a typed client generated from the server's contract |

| Stack | Packages | Summary |
| --- | --- | --- |
| `next-bun-express` | `server/bun-express`, `frontend/next` | Next.js 16 in front of Express 5 on Bun |
<!-- matrix:end -->
