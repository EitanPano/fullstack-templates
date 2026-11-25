# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A catalog of project templates plus the generator that turns them into runnable projects. Two kinds
of code live here, with different gates:

- `tools/` is the generator (TypeScript on Bun): `validate.ts`, `generate.ts`, `test-generated.ts`
  and `lib/`. It has its own `package.json`, tests and `check`.
- `server/<id>/base/`, `serverless/<id>/base/`, `frontend/<id>/base/` and `sdk/<id>/base/` are the
  template payloads: complete packages in their own language (Bun + Express 5, Python 3.14 +
  FastAPI, one Cloudflare Worker, Next.js 16, Vite + React 19, Astro 7, a browser SDK in
  TypeScript) with markers and placeholders inside. The tools copy and rewrite them; they never run them in place.

Everything else is manifests (`index.yaml`, `template.yaml`, `stack.yaml`, `tests/cases.yaml`,
`provider.yaml`, `capability.yaml`) validated against `schemas/*.json`, plus docs. The design is
`docs/adr/0001-catalog-architecture.md` (amendments appended per release); ADR 0002 is
`python-fastapi`; ADR 0003 is `frontend/react` and the deploy modes. `CONTRIBUTING.md` holds the
checklists for adding a template, provider or overlay and is the authority on workflow details not
repeated here.

`.superpowers/` is gitignored scratch (a stale catalog copy and generated projects). Exclude it
from searches or its copies of `base/` will shadow the real ones.

## The consumer: fullstack-dev-harness

A request to create a project from this catalog means the harness: follow its README, Start a
project. Never start a user's project by running `tools/generate.ts` directly.

This catalog is consumed by `github.com/EitanPano/fullstack-dev-harness` (ADR 0001 D8, D9). Its
bootstrap pins a release tag in `catalog.lock`, shallow-clones it, runs `tools/generate.ts`, and
its agents then work from the generated project alone. What the harness depends on, and so what
counts as a breaking change here:

- `index.yaml` and the chosen `template.yaml` files: the only catalog files the bootstrap skill
  reads, to list stacks and ask about flags and capabilities.
- The `generate.ts` command line (`--stack`, `--name`, `--flag`, `--capability`, `--deploy`,
  `--answers`, `--catalog`, `--catalog-version`, `--frontend <dir>=<template>`, repeatable; `--sdk <dir>=<template>`, once, with `--stack`).
- `.fullstack/catalog.yaml` (schema `schemas/provenance.schema.json`): the harness's agents take
  every command and port from it and never read the catalog again. Its top-level `deploy`
  (`single` or `split`) is written only when the plan has a server and a frontend.
- The fixed command vocabulary and the `AGENTS.md` headings ("Adding an entity", "Adding the data
  layer", "Errors", "Tests" for a server; "Adding a feature", "Styling", "Errors", "Tests" for a
  frontend; "Adding a feature", "Public API", "Errors", "Tests" for an `sdk` package;
  "Deployment" for all; a `serverless` package has the server's five), which the harness's
  skills cite by name. The twelve numbered SDK invariants of `docs/conventions.md › SDK` are
  cited by number too.
- `index.yaml` `schemaVersion`: the harness refuses a newer one, so bumping it is a catalog major.

To test a catalog change against the harness before tagging, point its bootstrap at this
checkout with `--templates <path>` or `FULLSTACK_TEMPLATES_DIR`.

## Commands

Install once with `cd tools && bun install`. Run the tools from the repository root.

Generator gates (first job in CI):

```sh
cd tools && bun run check                    # tsc, eslint, prettier --check, bun test
cd tools && bun test tests/markers.test.ts   # one file
cd tools && bun test -t "pins"               # by test name
```

The suite takes about 45 s and needs `uv` on PATH: the pyproject lockfile tests run the real uv.

Catalog validation:

```sh
bun tools/validate.ts               # manifests, schemas, cross-checks, marker dry-run of every flag x capability combination, pins, README matrix
bun tools/validate.ts --readme      # rewrite the README matrix; run after changing a manifest version or summary
bun tools/validate.ts --lockfiles   # frozen bun install / uv lock --check per base, in a scratch copy
bun tools/validate.ts --pin server/python-fastapi/database/postgres   # re-pin one overlay after reconciling it
```

Generate and test generated projects:

```sh
bun tools/generate.ts --stack next-bun-express --out ../my-app --name my-app \
  [--flag auth=false] [--capability database=postgres] [--deploy single|split] \
  [--skip-post-generate] [--keep-staging]
bun tools/generate.ts --template server/python-fastapi --out ../api --name api   # one package
bun tools/generate.ts --stack astro-cloudflare --out ../x --name x \
  --frontend site=frontend/astro --frontend admin=frontend/angular   # several frontends (serverless API only); a template other than the stack's own must be listed in its stack.yaml `frontends`
bun tools/generate.ts --stack react-bun-express --out ../x --name x \
  --sdk sdk-widget=sdk/browser   # one sdk package, only with --stack; the API package then ships its /api/sdk/ namespace
bun tools/test-generated.ts --list                                    # case ids: <kind>/<id>/<case>
bun tools/test-generated.ts --case server/bun-express/default          # generate, run its check
bun tools/test-generated.ts --case server/bun-express/postgres --with-services   # Docker: migrate, check, testDb
bun tools/test-generated.ts --case <id> --keep                         # keep the project and print its path
```

CI runs every case with `--e2e --install-browsers --with-services --with-app`. Without
`--with-services` a case with providers runs `check` only.

`--with-app` (cases with `withApp: true`) builds the images and runs the smoke per deploy mode, read
from the case's `deploy`: `single` checks `docker compose version` against the 2.35.0 floor, then
the SPA shell, a deep link, the JSON 404 and a clean `public/` on the server's port; `split` checks
the same through the frontend's proxy and that its container is non-root. With `--e2e` the
frontend's `testE2e` then also runs against the container (`E2E_BASE_URL`), after the dev-flow run.
Run Postgres cases one at a time on one machine: they publish the database on host port 5432.

### Where a template's gates run

A raw `base/` that carries capability markers does not pass its own `check`: marked lines import
modules only an overlay provides, and both variants of a marked line sit in the file until the
generator picks one. Do not run `bun run check` or `uv run poe check` inside `server/*/base/` and
expect green. Generate the relevant case with `--keep`, work and test in that project, then port
the change back to `base/` (and to the overlay copy when the file is shadowed, see pins below).

## Architecture of the tools

The pipeline, one module per step in `tools/lib/`:

1. `catalog.ts` `loadCatalog(root)` reads `index.yaml`, every `template.yaml`, `stack.yaml`,
   `tests/cases.yaml`, `shared/providers/*/*/provider.yaml` and
   `capabilities/*/*/capability.yaml`; `schema.ts` (ajv 2020) checks each against `schemas/`,
   and `capabilities.ts` cross-checks providers, overlays and cases. Problems accumulate and
   surface as one `CatalogError` listing all of them.
2. `plan.ts` `resolveRequest` turns a stack or template, flags, capability selections and an
   answers file into a `GenerationPlan`: packages with their dirs, resolved flags, selected
   providers, merged command vocabulary.
3. `generate.ts` `generate(catalog, plan)`: tool preflight (`preflight.ts` runs `<tool> --version`
   against the manifest's `tools`), then everything is built in `<out>/.fullstack-staging`.
   Per package: copy `base/`, copy each selected overlay over it, remove `onlyPaths` (template's,
   then each overlay's `flags.<f>.onlyPaths`), marker pass (`markers.ts`), dependency and
   script edits (`dependencies.ts`), placeholders (`placeholders.ts`). Then root files:
   `compose.ts` assembles `shared/docker/compose.yaml` with package and provider fragments and
   derives the migrate service, `gitignore.ts` merges fragments under header lines, provider
   `files` are create-only. Then `.fullstack/catalog.yaml` (`provenance.ts`), the `postGenerate`
   commands, `dropAfterPostGenerate`, and an atomic move into place with rollback. A failed run
   leaves nothing in `--out`.
4. `validate.ts` is `loadCatalog` plus `dry-run.ts` (marker pass for every flag x capability
   combination), `pins.ts`, `readme.ts` (the matrix between `<!-- matrix:start/end -->`) and,
   on request, `lockfiles.ts`.
5. `test-generated.ts` is `cases.ts` (one case per entry in each template's `tests/cases.yaml`,
   a stack case generating the whole stack) plus `run-case.ts` (generate into a temp dir, run
   the manifest's `check`, then services, `migrate`, `testDb`, e2e and the Compose app smoke as
   the flags allow).

`commands.ts` runs every external command without a shell (`spawnSync` with an argv split on
whitespace). `files.ts` holds the single ignore set (`node_modules`, `.venv`, `__pycache__`,
tool caches) that listing, copying, the dry-run and pins all share.

Tests: most unit tests use the mini fixture catalog at `tools/tests/fixtures/catalog` (templates
`mini`, `mini-py`, `mini-ui`, provider `fake`). `real-catalog.test.ts` generates from the real
catalog with `skipPostGenerate`. The `*-cli.test.ts` files spawn the entry scripts.

## Rules the code enforces that are easy to trip

- **Commands are argv, not shell.** A manifest `commands` or `container.migrate` entry is a program
  plus whitespace-separated arguments; the schema rejects `& | ; < > ' " $` and backticks. Put
  anything more elaborate in a package script and name that.
- **Fixed command vocabulary.** `install dev check typecheck lint format test testDb testE2e
  contract migrate`. The tools and the harness's agents only ever call these names, never the
  ecosystem's own invocation. Only `check` is required. `build` is not a command: an sdk's build
  is its package script, reached through its Dockerfile, `assemble` and `check`.
- **Markers** are `@name` or `@noname` at the end of a line, or `@name-start` ... `@name-end`
  blocks on their own lines (no nesting), written in the file's own comment syntax (`//`, `#`,
  `--` in `.sql`, `<!-- -->`; chosen by extension or file name in `markers.ts`). `name` is a flag
  (`auth`) or a capability: `@database` is true for any provider, `@database:postgres` for that
  one. Three selections are reserved and cannot be flag names: `server` (the plan has a server),
  `single` (the plan deploys as one image; never true without a server) and `sdk` (the plan holds an sdk package, true in every package of it; ADR 0020). A `serverless` package also
  has `frontend` (the plan has a frontend), reserved too, and a `serverless` package counts as the
  plan's `server` for a frontend's selections; a frontend also reads `server:serverless` (the plan's API is a `serverless` package), reserved too so no flag can carry the name. `frontends` (the plan holds more than one frontend) is
  reserved for `serverless` and `frontend` packages. Every extension
  `markers.ts` gives a comment syntax is a text file by construction (`placeholders.ts` derives its
  list from it), and a unit test pins that. A file of any other type is copied untouched: if it
  looks like text (no NUL byte in its first KiB) and holds a marker comment or a declared
  `__NAME__` token, generation and `validate` fail naming the file; a binary file is never read.
  An undeclared name, an unbalanced block or a marker left in generated output fails.
  Keep the no-capability variant byte for byte unchanged when adding markers.
- **Placeholders** are `__NAME__` tokens in text files. Templates declare their own
  (`__PROJECT_NAME__`); the generator adds `__PACKAGE_DIR__`, `__PORT__`, `__SERVER_DIR__`,
  `__SERVER_PORT__`, `__SERVER_DEV_COMMAND__`, and `__FRONTEND_DIR__` (the frontend's directory,
  for the server's Compose fragment); a `serverless` package beside a frontend also gets
  `__FRONTEND_PATH__` and `__FRONTEND_OUT__` (the first frontend's, undefined when the plan has
  no frontend), `__FRONTENDS__` (JSON list of `{dir,path,out,port}`, `[]` then) and
  `__FRONTEND_HOSTS__` (the local host map, empty then). A `server` or `serverless` package of a plan with an sdk also gets `__SDK_DIR__`, `__SDK_PATH__` (from its own directory), `__SDK_OUT__` (the sdk's `cdn.out`) and `__SDK_PORT__`, undefined without one (wrap their lines in `@sdk`); the sdk package gets the `__SERVER_*__` tokens, `__SDK_GLOBAL__` and `__SDK_SLOT__`. Each package's `__PORT__` is unique in the plan. A declared token left in output
  fails the run.
- **Two dependency adapters.** `npm` (bun-express, next): a flag's `dependencies.remove` and a
  capability's `dependencies` and `scripts` edit `package.json`; a script name the base already
  has is refused. `pyproject` (python-fastapi): the loader refuses those fields. A dependency or
  poe task that belongs to a flag or provider is a `pyproject.toml` line ending in `# @marker`,
  and `base/uv.lock` is the superset lock. Edit `pyproject.toml` by hand, then `uv lock` in
  `base/`; never `uv add` or `uv remove`, which can drop the trailing marker.
- **Pins.** Every base file an overlay shadows (same path in `base/` and `overlay/`, not under
  the capability's own `flags.<f>.onlyPaths`) is pinned in `capability.yaml` to git's blob id with
  CRLF read as LF. Changing a shadowed base file fails `validate` until the overlay copy is
  reconciled by hand and `--pin` is run; it prints the base diff per moved pin. Re-pinning
  without reading the diff defeats the mechanism.
- **Overlay files and flags.** Overlays are copied before `onlyPaths` are removed, so `auth=false`
  also drops overlay files at the template's `onlyPaths`. A capability's own `flags.<f>.onlyPaths`
  entries must be files only the overlay adds.
- **Migrate service.** A capability's `container.migrate` derives a one-shot `<dir>-migrate`
  Compose service (profile `app`) that the package service waits on; two in one package is an
  error. The server never migrates on boot; `commands.migrate` is for local development.
- **Index and manifest agree.** `validate` fails when a template's `version` or `summary` differs
  from `index.yaml`, when a template directory is not listed, when a server's `AGENTS.md` lacks one
  of "Adding an entity", "Adding the data layer", "Errors", "Tests" and "Deployment", when a
  frontend's lacks one of "Adding a feature", "Styling", "Errors", "Tests" and "Deployment" (the
  layer map is not a checked heading), when an sdk's lacks one of "Adding a feature", "Public
  API", "Errors", "Tests" and "Deployment", when `tests/cases.yaml` lacks `default` or a case flipping
  each flag, and when a listed provider lacks the case alone at default flags and the case with
  every flag off.

## Architecture of the templates

`docs/conventions.md` is the language-neutral contract. Every server template has the same
directories (`config/`, `api/<entity>/{routes,controller,schema,service}`, `models/`,
`middleware/`, `services/`, `infra/`), the same request flow (`config routes -> entity routes ->
gates -> controller handler -> service -> db seam -> infra store`), import direction enforced by
the language's own tool (ESLint import zones in bun-express, import-linter contracts in
`pyproject.toml` for python-fastapi), OpenAPI 3.1 produced from the validation schemas, one error
envelope, `/api/health` and `/api/health/ready`. A frontend's layer map is in its
`AGENTS.md`; the shared names are `layout/`, `services/`, `store/`, `models/`, `shared/`,
`core/`, `styles/`, plus `pages/` in the SPAs or `app/` and `actions/` in Next. The client generated
from the server's `openapi.json` (the `contract` command) is in `services/generated/` (Angular:
`src/app/services/generated/`). Server-rendered (Next's server calls the API through `API_URL`) or
single-page (the browser calls relative `/api`, no CORS). An SPA declares `static: { out: dist }`, has a Dockerfile with a `dist` and a
`serve` target, and passes the contract in `docs/conventions.md › Frontend, single-page app`.

**The SDK kind** (ADR 0020). An `sdk` template (`sdk/browser`) is a library other sites load, not a
frontend: `--sdk <dir>=<template>`, once, only beside a `--stack`, and it is no stack member. Its
manifest names `cdn: { out }`, the directory the API package serves, laid out `v<major>/loader.js`,
`frame.js`, `frame.html`. The reserved `sdk` selection turns on, in every package of the plan, the
SDK namespace of each API template (`api/sdk/<entity>/` at `/api/sdk/v1`: CORS for the namespace
alone, the `X-Sdk-Key` key, a rate limit, `GET /api/sdk/v1/config` as the kill switch, plus the two
routes `/api/sdk/dist/v<major>/<file>` and `/api/sdk/frame/v<major>?k=<key>`), through `onlyWhen:
{ sdk }`, `@sdk` markers and the `__SDK_*__` placeholders; without an SDK the generated tree is
the old one. The three API templates are kept parallel here too: the same headers, status codes,
limits and env (`SDK_KEYS`, `SDK_ENABLED`, `SDK_DIR`); the Worker's differences are in
`docs/conventions.md › Serverless`, FastAPI's routing ones in its README. The files reach the server through a build-only Compose service (`additional_contexts`, Compose
2.35.0 in both modes) or the Worker's `assemble`. The SDK's API report is `etc/sdk.api.txt` with
`// public` tags, because the tools read `// @public` as a marker.

**Deploy modes** (`--deploy`, ADR 0003). `split`: one image per package, the frontend public and the
server on loopback, `TRUST_PROXY` 1. `single`: one image, the server serving the SPA's `dist/`
behind `STATIC_DIR` (static serving ships in both servers and is inert unset), `TRUST_PROXY` false.
`single` is the default when the plan has a server and the frontend declares `static`; `next` is
always `split` and `--deploy single` with it is refused. The server's Dockerfile and Compose
fragment carry the mode in `@single`/`@nosingle` lines, and the frontend's fragment is a build-only
service in `single` (`target: dist`, `scale: 0`) that the server reads as `additional_contexts: {
spa: "service:<dir>" }`, which needs **Docker Compose 2.35.0 or later**. `docker compose down` needs
`--profile app`.

A `serverless` API (`serverless/cloudflare`, ADRs 0014 and 0016) has no deploy mode and no Compose
file, and a frontend with `docker: false` (`frontend/astro`) joins a plan alone or beside it, never
beside a `server`; beside a `serverless` API a plan may hold several frontends (ADR 0015), each the stack's own template or, as one of several, one its `stack.yaml` lists under `frontends` (ADR 0017: `astro-cloudflare` lists `frontend/angular`); `docs/conventions.md › Serverless` is its contract.

The two server templates are kept behaviourally parallel on purpose: same endpoints, error codes,
flags, cases and overlay shape. ADR 0002 has the table of intentional deviations; check it before
"fixing" a difference. Each `base/AGENTS.md` is the layer map agents load in a generated project
and documents both the base and the postgres variant. The static-serving rows of ADR 0003 M5-5 are a
second parallel contract between the two servers, with a test per row in each.

## Changing a template

- Bump `version` in `template.yaml` and `index.yaml` together and add a `CHANGELOG.md` entry, then
  `bun tools/validate.ts --readme`. A template's major bumps when the generated layout would move
  files in an existing project.
- Every `base/` commits its lockfile (`bun.lock` or `uv.lock`); CI checks it frozen with
  `validate --lockfiles`. uv is pinned to the window `>=0.12.23,<0.14` in `template.yaml`,
  `pyproject.toml` and the Dockerfile together; moving it is a template minor.
- `tests/cases.yaml` covers each flag alone, each capability alone, each capability with every
  flag off, and the stack combinations. The README matrix lists only tested combinations.
- Refreshing `frontend/next/base` after a Next bump, and `frontend/react/base` after a dependency
  move, follow the numbered sequences in CONTRIBUTING.md. The react base pins ESLint 9, TypeScript
  5.9 and React 19.3.0 on purpose (reasons there).
- Catalog releases are tags `vMAJOR.MINOR.PATCH`: major for a `schemaVersion` change, minor for a
  new template, provider or capability, patch for fixes. The release workflow re-runs every case
  before publishing.

Line endings are LF everywhere (`.gitattributes`). The repo is developed on Windows as well as
Linux, so tools normalise CRLF where it matters (pins, the README matrix comparison).
