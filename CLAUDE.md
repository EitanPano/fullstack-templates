# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A catalog of project templates plus the generator that turns them into runnable projects. Two kinds
of code live here, with different gates:

- `tools/` is the generator (TypeScript on Bun): `validate.ts`, `generate.ts`, `test-generated.ts`
  and `lib/`. It has its own `package.json`, tests and `check`.
- `server/<id>/base/` and `frontend/<id>/base/` are the template payloads: complete packages in
  their own language (Bun + Express 5, Python 3.14 + FastAPI, Next.js 16, Vite + React 19) with
  markers and placeholders inside. The tools copy and rewrite them; they never run them in place.

Everything else is manifests (`index.yaml`, `template.yaml`, `stack.yaml`, `tests/cases.yaml`,
`provider.yaml`, `capability.yaml`) validated against `schemas/*.json`, plus docs. The design is
`docs/adr/0001-catalog-architecture.md` (amendments appended per release); ADR 0002 is
`python-fastapi`; ADR 0003 is `frontend/react` and the deploy modes. `CONTRIBUTING.md` holds the
checklists for adding a template, provider or overlay and is the authority on workflow details not
repeated here.

`.superpowers/` is gitignored scratch (a stale catalog copy and generated projects). Exclude it
from searches or its copies of `base/` will shadow the real ones.

## The consumer: fullstack-dev-harness

This catalog is consumed by `github.com/EitanPano/fullstack-dev-harness` (ADR 0001 D8, D9). Its
bootstrap pins a release tag in `catalog.lock`, shallow-clones it, runs `tools/generate.ts`, and
its agents then work from the generated project alone. What the harness depends on, and so what
counts as a breaking change here:

- `index.yaml` and the chosen `template.yaml` files: the only catalog files the bootstrap skill
  reads, to list stacks and ask about flags and capabilities.
- The `generate.ts` command line (`--stack`, `--name`, `--flag`, `--capability`, `--deploy`,
  `--answers`, `--catalog`, `--catalog-version`).
- `.fullstack/catalog.yaml` (schema `schemas/provenance.schema.json`): the harness's agents take
  every command and port from it and never read the catalog again. Its top-level `deploy`
  (`single` or `split`) is written only when the plan has a server and a frontend.
- The fixed command vocabulary and the `AGENTS.md` headings ("Adding a module", "Adding the data
  layer", "Errors", "Tests" for a server; "Adding a feature", "Styling", "Errors", "Tests" for a
  frontend; "Deployment" for both), which the harness's skills cite by name.
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
  ecosystem's own invocation. Only `check` is required.
- **Markers** are `@name` or `@noname` at the end of a line, or `@name-start` ... `@name-end`
  blocks on their own lines (no nesting), written in the file's own comment syntax (`//`, `#`,
  `--` in `.sql`, `<!-- -->`; chosen by extension or file name in `markers.ts`). `name` is a flag
  (`auth`) or a capability: `@database` is true for any provider, `@database:postgres` for that
  one. Two selections are reserved and cannot be flag names: `server` (the plan has a server) and
  `single` (the plan deploys as one image; never true without a server). Every extension
  `markers.ts` gives a comment syntax is a text file by construction (`placeholders.ts` derives its
  list from it), and a unit test pins that. A file of any other type is copied untouched: if it
  looks like text (no NUL byte in its first KiB) and holds a marker comment or a declared
  `__NAME__` token, generation and `validate` fail naming the file; a binary file is never read.
  An undeclared name, an unbalanced block or a marker left in generated output fails.
  Keep the no-capability variant byte for byte unchanged when adding markers.
- **Placeholders** are `__NAME__` tokens in text files. Templates declare their own
  (`__PROJECT_NAME__`); the generator adds `__PACKAGE_DIR__`, `__PORT__`, `__SERVER_DIR__`,
  `__SERVER_PORT__`, `__SERVER_DEV_COMMAND__`, and `__FRONTEND_DIR__` (the frontend's directory,
  for the server's Compose fragment). A declared token left in output fails the run.
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
  of "Adding a module", "Adding the data layer", "Errors", "Tests" and "Deployment", when a
  frontend's lacks one of "Adding a feature", "Styling", "Errors", "Tests" and "Deployment" (the
  layer map is not a checked heading), when `tests/cases.yaml` lacks `default` or a case flipping
  each flag, and when a listed provider lacks the case alone at default flags and the case with
  every flag off.

## Architecture of the templates

`docs/conventions.md` is the language-neutral contract. Every server template has the same
directories (`config/`, `api/<module>/{routes,controller,schema,service}`, `models/`,
`middleware/`, `services/`, `infra/`), the same request flow (`config routes -> module routes ->
gates -> controller handler -> service -> db seam -> infra store`), import direction enforced by
the language's own tool (ESLint import zones in bun-express, import-linter contracts in
`pyproject.toml` for python-fastapi), OpenAPI 3.1 produced from the validation schemas, one error
envelope, `/api/health` and `/api/health/ready`. A frontend is `app/` for routing only,
`feature/<name>/` (`ui/`, a data layer, `model`), product-agnostic `shared/`, and `lib/api/` holding
the client generated from the server's `openapi.json` (the `contract` command). It has one of two
shapes: server-rendered (`next`: `feature/*/server/`, the Next server calls the API through
`API_URL`) or a single-page app (`react`: `feature/*/api/` route loaders, the browser calls relative
`/api`, no CORS). An SPA declares `static: { out: dist }`, has a Dockerfile with a `dist` and a
`serve` target, and passes the contract in `docs/conventions.md › Frontend, single-page app`.

**Deploy modes** (`--deploy`, ADR 0003). `split`: one image per package, the frontend public and the
server on loopback, `TRUST_PROXY` 1. `single`: one image, the server serving the SPA's `dist/`
behind `STATIC_DIR` (static serving ships in both servers and is inert unset), `TRUST_PROXY` false.
`single` is the default when the plan has a server and the frontend declares `static`; `next` is
always `split` and `--deploy single` with it is refused. The server's Dockerfile and Compose
fragment carry the mode in `@single`/`@nosingle` lines, and the frontend's fragment is a build-only
service in `single` (`target: dist`, `scale: 0`) that the server reads as `additional_contexts: {
spa: "service:<dir>" }`, which needs **Docker Compose 2.35.0 or later**. `docker compose down` needs
`--profile app`.

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
