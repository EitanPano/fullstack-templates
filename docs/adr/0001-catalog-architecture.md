# ADR 0001: the template catalog and how the harness consumes it

Status: accepted (2026-10-22)
Owner: Eitan
Repositories: `github.com/EitanPano/fullstack-templates` (this one, new) and
`github.com/EitanPano/fullstack-dev-harness` (the consumer)

## Intent

Two repositories with one job between them: let a developer run the harness's bootstrap,
pick a stack, and get a runnable project whose architecture is already right, so the AI
agents that work in it afterwards follow a layer map instead of guessing one.

- `fullstack-templates` (the catalog) holds every template, the selectable providers
  (database, cache, messaging), the named stacks, the generator and the tests that prove
  each template generates and passes its own gates. It is usable on its own, without the
  harness.
- `fullstack-dev-harness` (the harness) stops owning templates. Its bootstrap fetches a
  pinned version of the catalog, asks the product questions, delegates generation to the
  catalog's tools, and its agents become stack-agnostic: every package carries its own
  `AGENTS.md`, and the commands the agents run come from a provenance file the generator
  writes.

The why: the harness today is TypeScript all the way down (Express, zod, `bun run check`,
`schema.d.ts`). A FastAPI project bootstrapped from it would get agents following rules
that do not apply. Moving the templates out, and the stack-specific knowledge with them,
is what makes a second language possible. The catalog is also meant to be a visible,
credible piece of work on Eitan's GitHub profile: every template in it generates and runs,
or it is not in it.

## Goals

1. `bootstrap → pick a stack → runnable project` with the harness; `clone → generate` without
   it.
2. Every template, flag and capability combination that the catalog lists is generated and
   gate-checked in CI. The README's matrix is the truth, not a wish list.
3. One language-neutral architecture contract for servers (and one for frontends, one for
   workers) that every template implements in its language's idiom, so an agent moving
   between a Bun project and a FastAPI project finds the same directories, flow and rules.
4. The harness reads at most two small catalog files with the model in the loop
   (`index.yaml`, the chosen template's `template.yaml`); everything else is a script.
5. Provenance: a generated project records what it was made from, so a later "refactor an
   existing project toward a template" mode has something to diff against.

## Non-goals (v1)

- A general templating engine. Generation is copy, overlay, placeholder substitution and
  line markers. No Jinja, Handlebars or Mustache: `{{ }}` collides with Vue, Angular and
  Jinja templates that future templates will contain.
- Updating an already generated project to a newer template version. The provenance file
  makes it possible later; nothing in v1 implements it.
- The "wrap an existing project" mode. It is a separate project that consumes the same
  catalog; it gets its own ADR.
- Any language beyond TypeScript on Bun. v1 moves the two templates that exist, builds the
  machinery around them, and proves one capability. Python, .NET, Java, PHP, Vue and
  Angular come one at a time afterwards, each fully runnable before it is listed.
- Publishing to npm, PyPI or any registry. The git tag is the release.

## Anti-goals

- A template that is listed but does not generate, or generates but does not pass its own
  `check`. The catalog's credibility is the whole point; CI blocks such a template.
- The AI browsing the catalog cache. The bootstrap skill forbids it and the cache lives
  outside the working tree, so no Glob, Grep or Explore agent lands in it.
- Stack specifics leaking back into the harness's root files. If a rule names zod,
  Express or `bun run`, it belongs in a template's `AGENTS.md`, not in the harness.
- Choosing a database for the developer. A database is a selectable provider; "none,
  decide later" stays a valid answer and leaves the in-memory store in place.

## Constraints

- Harness prerequisites stay as they are: Bun 1.4+, Node 24+, git, Docker optional.
- The harness's guardrail lanes are keyed on directories (`backend/`, `frontend/`);
  generated packages keep those directory names regardless of the template's language
  (`worker/` is added when the first worker template lands).
- The harness's conventions remain: singular names, kebab-case files, no `docs/` in the
  harness (the catalog has `docs/`, as a normal open-source repository does), no commit
  without approval, Conventional Commits.
- Windows is a first-class development host (the author's machine). Paths, spawning
  `bun` through its `.cmd` shim and CRLF checkouts are handled as the current bootstrap
  handles them.
- No real secrets in any file; `.env.example` placeholders only.

## Decisions

### D1. Repository layout

```
fullstack-templates/
├── index.yaml                 # schemaVersion, templates[], stacks[]; small by rule
├── README.md                  # the matrix: template × flags × capabilities, each with CI status
├── CONTRIBUTING.md            # how to add a template, a provider, a capability; the checklist
├── LICENSE
├── server/<id>/               # bun-express in v1
├── frontend/<id>/             # next in v1
├── worker/<id>/               # none in v1; the layout is defined (D4)
├── shared/
│   ├── providers/
│   │   ├── database/<name>/   # postgres in v1 (mongodb, mysql, mariadb, sqlserver, sqlite later)
│   │   ├── cache/<name>/      # defined, none shipped in v1
│   │   └── messaging/<name>/  # defined, none shipped in v1
│   ├── gitignore/             # one fragment per ecosystem: node, python, dotnet, …; merged
│   ├── editorconfig/
│   └── docker/                # compose skeleton the generator assembles fragments into
├── stacks/<id>/stack.yaml     # next-bun-express in v1
├── schemas/                   # JSON Schema: index, template, capability, provider, stack, cases, provenance
├── docs/
│   ├── conventions.md         # the language-neutral contracts (D4)
│   ├── capabilities.md        # what database, cache and messaging mean for a template
│   └── adr/
├── tools/                     # validate, generate, test-generated (D6)
└── .github/
    ├── CODEOWNERS
    └── workflows/             # validate on PR; generate-and-check matrix; release on tag
```

Inside a template:

```
<kind>/<id>/
├── template.yaml              # the manifest (D2)
├── README.md                  # what it is, how it is laid out, how to run it
├── CHANGELOG.md               # per-template semver history
├── compose.yaml               # this package's Compose service fragment (D5)
├── base/                      # the complete runnable package; placeholders and markers inside
├── capabilities/              # server and worker only
│   └── <kind>/<provider>/     # capability.yaml + the overlay files
└── tests/cases.yaml           # named input sets the generation tests run
```

The generated directory name is not the template id: a stack maps `server/bun-express` to
`backend/` and `frontend/next` to `frontend/`. Template ids are `<runtime>-<framework>`
for servers (`bun-express`, `python-fastapi`), the framework name for frontends (`next`,
`react`, `vue`, `angular`), `<runtime>-consumer` for workers. Stack ids are
`<frontend>-<server>` (`next-bun-express`, later `react-python-fastapi`). My call; Eitan's
sketch used family names (`react-node`), which are ambiguous once two Node servers exist.

A stack manifest (`stacks/<id>/stack.yaml`) lists its packages and their directories and
nothing else; order and wiring are derived:

```yaml
schemaVersion: 1
id: next-bun-express
summary: Next.js 16 App Router in front of Express 5 on Bun
packages:
  - { template: server/bun-express, dir: backend }
  - { template: frontend/next, dir: frontend }
```

`base/` is the complete package as it should land on disk: for `frontend/next` that is
the pinned `create-next-app` output with the harness's overlay already merged (no
`package.partial.json`, no merge step, boilerplate removed). Each `base/` commits its
lockfile (`bun.lock`); `install` runs frozen during generation tests, so a generated
project is reproducible and a red CI means a template changed, not the registry. The
catalog refreshes lockfiles through a dependency bot (tool left to the builder) and a
template's CHANGELOG records the bump. My call, reversing the harness's "caret ranges
until the first lockfile" rule: a catalog that promises green generation cannot float.

**What the generator writes at the project root** and what it never touches. It writes
the packages, `docker-compose.yml`, `.editorconfig`, `.gitignore` (merged: fragments the
chosen templates and providers declare, appended under a marker header when the file
exists), provider files (`db/init.sql`) and `.fullstack/catalog.yaml`. A package directory
that already exists is a refusal. Root files other than `.gitignore` are created only when
absent and never overwritten. Generation builds the whole tree in a temporary directory
and moves it into place only when every step succeeded, so a failed generation leaves
nothing to clean by hand (today's "delete `frontend/` and `backend/` yourself" failure
mode goes away). Everything else at the root is the consumer's: in the harness, `.doc/`,
`.plan/`, `.claude/`, `README.md` and `catalog.lock` are harness files and the generator
does not know they exist. A standalone `clone → generate` project gets exactly the files
listed above and nothing more.

### D2. The template manifest

`template.yaml` is the only thing the generator and the harness need to know about a
template. Validated by `schemas/template.schema.json`.

```yaml
schemaVersion: 1
id: bun-express
kind: server                        # server | frontend | worker
name: Express 5 on Bun
version: 1.0.0                      # the template's own semver; CHANGELOG.md matches
summary: Layered Express 5 API on Bun with zod, OpenAPI from the schemas, auth, jobs and a bus
runtime: { language: typescript, platform: bun, minVersion: '1.4' }
tools:                              # what must be on PATH to generate and run it
  - { name: bun, min: '1.4' }
  - { name: node, min: '24' }
placeholders: [PROJECT_NAME]        # substituted as __PROJECT_NAME__ in text files
flags:                              # boolean choices that keep or drop lines, files, dependencies
  auth:
    summary: Accounts, sessions, JWT, OTP; off means every endpoint is public
    default: true
    onlyPaths: [src/api/auth, src/api/user, …]        # removed when false; must exist
    dependencies: { remove: [cookie-parser, jose, '@types/cookie-parser'] }
capabilities:                       # which providers this template has overlays for
  database: { providers: [postgres] }
  cache: { providers: [] }
  messaging: { providers: [], mode: push }   # server: push; worker: pull
dependencies: { manifest: package.json, adapter: npm }   # how add/remove is applied
commands:                           # the vocabulary the harness agents use; check is required
  install: bun install
  dev: bun run dev
  check: bun run check
  typecheck: bun run typecheck
  lint: bun run lint
  format: bun run format
  test: bun test
  contract: bun run openapi         # server: produce; frontend: consume
contract: { produces: openapi.json }                    # frontend: { consumes: '<server>/openapi.json' }
http: { port: 4000, health: /api/health, ready: /api/health/ready }
agents: AGENTS.md                   # the layer map, inside base/, loaded by the agents in that package
postGenerate:                       # ordered, run from the package directory, by command name
  - install
  - contract
  - format
```

Rules the manifest carries:

- **Placeholders** are `__NAME__` tokens, declared, substituted in text files only. The
  generator substitutes declared names and fails if one is left; it ignores undeclared
  `__x__` tokens (`__dirname`, `__PURE__`).
- **Markers** generalise the harness's `@auth`/`@noauth` mechanism: in the file's comment
  syntax, `@<flag>` keeps a line only when the flag is on, `@no<flag>` only when off,
  `@<flag>-start` … `@<flag>-end` for a block; `@<capability>:<provider>` and
  `@<capability>` (any provider) work the same way for capabilities. Validation runs every
  marker pass over every template before anything is generated and fails on an unbalanced
  block or a leftover marker, exactly as today.
- **Dependencies** are added and removed through a named adapter, because package
  manifests have no comments and differ per ecosystem. v1 ships `npm` (package.json
  keys); `pyproject`, `maven`, `nuget`, `composer` arrive with their templates.
- **Commands** are a fixed vocabulary (`install`, `dev`, `check`, `typecheck`, `lint`,
  `format`, `test`, `testDb`, `testE2e`, `contract`, `migrate`). `check` is required and
  must run every gate without Docker. The harness's agents and skills say "run the
  package's `check` command"; they never spell `bun run check`.
- **Answers are package-qualified.** The generator takes `--answers <json>` of the shape
  `{ "projectName": "...", "packages": { "backend": { "flags": {...}, "capabilities":
  {...} } } }`. The CLI shorthands `--flag auth=false` and `--capability
  database=postgres` route to the one package in the stack whose template declares that
  flag or capability and fail when two do. The harness passes the JSON form.
- **Cross-package order** comes from `contract`: a package whose `contract.consumes`
  names `<server>` runs its `postGenerate` after the server package's; `<server>` resolves
  to that package's directory in the stack. A frontend generated alone (no server in the
  stack) skips its `contract` step and keeps the generated client types committed in its
  `base/`, which are produced from the server template it is paired with in its default
  stack (for `next`, `bun-express`'s health endpoint), so it type-checks on its own.

### D3. Capabilities and providers

A **provider** (`shared/providers/<kind>/<name>/provider.yaml`) is language-agnostic: a
Compose service fragment, an env contract, and init files.

```yaml
schemaVersion: 1
kind: database
id: postgres
name: PostgreSQL 17
compose: compose.yaml               # service `database`, healthcheck, volume
env:
  - name: DATABASE_URL
    local: postgres://app:app@localhost:5432/app      # outside production
    compose: postgres://app:app@database:5432/app     # inside the compose network
    test: postgres://app:app@localhost:5432/app_test
files: [db/init.sql]                # copied to the project root; creates app_test
```

A **capability overlay** (`<template>/capabilities/<kind>/<provider>/`) is how one
template binds one provider: the files that replace or join `base/` (the engine's infra
file, the rewritten db seam and repositories, the migration script, the test-database
helpers), the dependencies to add, and the marker name it turns on.

```yaml
schemaVersion: 1
kind: database
provider: postgres
dependencies: { add: { … } }
commands: { testDb: bun run test:db, migrate: bun run db:migrate }   # merged into the manifest's
```

Selecting `database: postgres` for `server/bun-express` therefore: copies the overlay
over `base/`, applies `@database` and `@database:postgres` markers, adds the dependencies,
appends the provider's env entries to the package's `.env.example` and to its Compose
service, adds the provider's service to the root Compose file, copies `db/init.sql`, and
adds `testDb` and `migrate` to the recorded commands. Selecting no database leaves the
in-memory store, so the harness's data-layer task (the `database` skill) still applies
later. Both paths are kept valid on purpose.

`docs/capabilities.md` defines the contract for each kind: what "database" means for a
server (a `Resource` connected at boot, pinged by readiness, closed on shutdown; one
repository per module; a separate test database; migrations or indexes shipped with a
change), for a worker (the same client, no HTTP); what "cache" means (typed `get`, `set`
with TTL, `del`, atomic `incr` with first-write TTL); what "messaging" means in push mode
(a server publishes events; delivery is at-least-once; a subscriber is idempotent) and in
pull mode (a worker consumes; ack after success; dead-letter after N attempts). These are
the harness's existing `database` skill rules, made language-neutral; the TypeScript
specifics move into the overlays and the template's `AGENTS.md`.

Overlays and flags compose in a fixed order: copy `base/`, copy every selected overlay
over it, then apply flags (remove `onlyPaths`, run the marker pass, apply dependency
changes). A flag's `onlyPaths` therefore also removes overlay files at those paths, so the
postgres overlay ships its `user` repository and `session` rewrite and `auth=false` simply
drops them. Every template's `tests/cases.yaml` covers each flag alone, each capability
alone, and each capability with every flag off: for `bun-express` in v1 that is `default`,
`auth-off`, `postgres` and `auth-off-postgres`. The README matrix lists only tested
combinations.

v1 ships the mechanism in the schemas and the generator, and exactly one overlay to prove
it: `database/postgres` for `bun-express`, using Bun's built-in `SQL` client (no new
package, the `database` skill's default). This overlay is new code: the harness has only
the skill's prose and the in-memory store, so milestone 3 implements what the `database`
skill's data-layer task describes, once, as the overlay. Cache and messaging providers are
defined in `capabilities.md` and the schemas, with no overlay yet.

### D4. The language-neutral contracts (`docs/conventions.md`)

What every template of a kind must satisfy, so an agent finds the same shape in any
language. The harness's backend layer map is the source; the contract is its
language-neutral core.

**Server**

- Two entry files: one that reads config, connects dependencies, listens and handles
  shutdown (`index`), and one that builds the application without listening (`server`),
  so tests import the app and never start infrastructure.
- Directories: `config/` (env read once, constants, CORS, the route list), `api/<module>/`
  (`route` the HTTP adapter, `controller` the module's public API, `schema` the leaf,
  `service` and `repository` only when the module has rules or data of its own),
  `models/<name>/` (entity types), `middleware/`, `services/` (stateful shared
  capabilities; `security/`, `communicate/`, pure `utils/`), `infra/` (live connections
  as resources, `jobs/`, `subscribers/`, `scripts/`).
- Request flow: `routes → route → middleware → controller → service → repository → db seam
  → infra store`. Behaviour crosses modules only through controllers. A route holds no
  logic beyond mounting middleware, validating, one controller call and the response.
- Import direction enforced by the language's tool: ESLint zones (TypeScript),
  import-linter (Python), ArchUnit (Java), NetArchTest (.NET), deptrac (PHP). What the
  tool cannot express is listed in `AGENTS.md` as a review rule.
- Contract: OpenAPI 3.1 produced from the same schemas that validate requests (zod,
  pydantic, FluentValidation with Swashbuckle, Bean Validation with springdoc, Laravel
  form requests with Scramble). Singular resource paths under `/api/`, JSON only, one
  error envelope, a request id on every response.
- `GET /api/health` (liveness, no store) and `GET /api/health/ready` (pings every
  resource, 503 with a per-dependency map).
- Config from environment variables only, read once, failing fast in production on a
  missing secret and defaulting elsewhere with a warning.
- Logging: one line per request (method, path without query, status, duration, request
  id), every unexpected error with its stack, secrets redacted.
- One Docker image, non-root user, port from env.

The per-language equivalents (the table every new server template is written against):

| Concern | bun-express | python-fastapi | dotnet-minimal-api | java-spring-boot | php-laravel |
| --- | --- | --- | --- | --- | --- |
| Validation + contract | zod, zod-to-openapi | pydantic, FastAPI's OpenAPI | FluentValidation, Swashbuckle | Bean Validation, springdoc | Form requests, Scramble |
| Layer enforcement | ESLint import zones | import-linter | NetArchTest | ArchUnit | deptrac |
| Gates (`check`) | tsc, eslint, prettier, bun test | mypy, ruff, pytest | dotnet build, format, test | mvn verify, spotless | phpstan, pint, pest |
| Env | zod-parsed `env.ts` | pydantic-settings | `IOptions` + validation | `@ConfigurationProperties` | `config/` + env |
| Jobs / bus | croner, in-process bus | APScheduler, in-process | hosted services | `@Scheduled`, events | scheduler, events |

**Frontend**

- `app/` (or the router's equivalent) is routing only. `feature/<name>/` holds `ui/`,
  the data access (`server/` for a server-rendered framework, `api/` otherwise) and
  `model.ts`. `shared/` is product-agnostic and never imports a feature. `lib/api/` holds
  the typed client generated from the server's contract and is imported only by a
  feature's data layer. Import direction `app → feature → shared, lib`.
- Gates: typecheck, lint, format, unit tests; e2e with an accessibility scan.
- Tokens as CSS variables; one toast library, one icon set per template.

**Worker**

- The server layout without `api/` and `middleware/`: `config/`, `models/`, `services/`,
  `infra/` with the consumer loop under `infra/consumers/`. Pull-mode messaging. Health as
  a liveness file or a tiny HTTP endpoint, declared in the manifest.

### D5. Compose assembly and root files

A generated project's `docker-compose.yml` is assembled, not copied: the skeleton from
`shared/docker/` plus one service fragment per package (`compose.yaml` next to each
`template.yaml`, parameterised by the package directory and port) plus one per selected
provider. Application services sit under the `app` profile; providers have no profile, so
`docker compose up -d database` starts one for local work, exactly as the harness does
today. `.gitignore` is merged from the ecosystems the chosen templates declare;
`.editorconfig` is copied.

### D6. Tools

TypeScript, run with Bun (`bun tools/<name>.ts`), dependencies `yaml` and `ajv` with a
committed lockfile. My call: the harness already requires Bun, and a YAML catalog needs a
YAML parser, which rules out the dependency-free Node style of the harness's current
bootstrap. The cost is that generating a Python or Java project needs Bun on the machine;
the README says so.

- `tools/validate.ts`: every manifest against its schema; `index.yaml` consistent with the
  directories (nothing listed that does not exist, nothing on disk that is not listed);
  every marker pass over every template for every flag and capability combination;
  declared `onlyPaths` exist; `index.yaml` summaries are one line.
- `tools/generate.ts --stack <id> | --template <kind/id> … --out <dir> --name <name>
  [--flag auth=false] [--capability database=postgres] [--answers <json>]`: the pipeline
  of D2, D3 and D5, then `postGenerate`, then writes the provenance file. Deterministic:
  same inputs, same tree. Refuses a non-empty target directory.
- `tools/test-generated.ts [--case <template>/<case>] [--with-services]`: for each case in
  every `tests/cases.yaml`, generates into a temporary directory and runs the package's
  `check`; with `--with-services`, starts the case's providers with Compose and runs
  `testDb` too. Fails on the first red gate; prints the temporary directory for inspection.

CI: `validate` on every pull request; the `test-generated` matrix (one job per template
case, services started on the runner) on pull requests and on `main`; a release workflow
that runs both and creates the GitHub release on a `v*` tag.

### D7. Provenance

The generator writes `.fullstack/catalog.yaml` at the project root:

```yaml
schemaVersion: 1
catalog:
  repository: https://github.com/EitanPano/fullstack-templates
  version: v1.0.0
  commit: <sha>
generatedAt: 2026-10-22T10:00:00Z
stack: next-bun-express
packages:
  backend:
    template: server/bun-express
    version: 1.0.0
    flags: { auth: true }
    capabilities: { database: postgres }
    commands: { install: bun install, check: bun run check, testDb: bun run test:db, … }
    http: { port: 4000, health: /api/health, ready: /api/health/ready }
  frontend:
    template: frontend/next
    version: 1.0.0
    commands: { … }
providers: { database: postgres }
answers: { projectName: my-app }
```

It is committed with the scaffold. The harness's agents read commands and ports from it
and never need the catalog again; the future refactor mode diffs against it.

### D8. How the harness consumes the catalog

- `catalog.lock` at the harness root: `repository`, `version` (a tag), `commit` (the
  resolved SHA). The harness is tested against exactly that version; bumping it is a
  reviewed change.
- `scripts/bootstrap.mjs` becomes a thin driver: read the lock; unless
  `--templates <path>` or `FULLSTACK_TEMPLATES_DIR` points at a local checkout, shallow-clone
  the tag into `~/.cache/fullstack-templates/<version>/` (override with
  `FULLSTACK_TEMPLATES_CACHE`) if absent and verify the commit; `bun install
  --frozen-lockfile` in the cache's `tools/` once; refuse a catalog whose
  `index.yaml` `schemaVersion` is newer than the harness supports; run
  `tools/generate.ts`; verify `.fullstack/catalog.yaml` exists and names the expected
  packages; print the next steps (gates per package from the provenance file, then the
  `.doc/` and backlog instructions, which only the harness knows about). It no longer
  copies anything itself, and `templates/` leaves the harness. Its interface:
  `node scripts/bootstrap.mjs --stack <id> --name <name> [--flag k=v]… [--capability
  k=v]… [--templates <path>] [--root <dir>] [--skip-install]`. `--auth none` is gone,
  replaced by `--flag auth=false`, with no alias: nothing outside the harness's own docs
  calls it, and those docs change in the same milestone. `--root` stays for validating
  the harness in a scratch directory.
- The bootstrap skill gains a step between the product forms and the scaffold: list the
  stacks from `index.yaml`, ask which one, ask the flags and capabilities the chosen
  templates declare (auth, database), and pass them as answers. The model reads
  `index.yaml` and the chosen `template.yaml` files and nothing else from the cache; the
  skill says so.
- When a database provider was chosen at generation, the "add the data layer" backlog line
  is not written; when "decide later" was chosen, it is, as today.

### D9. The harness goes stack-agnostic

What moves and what stays, so a FastAPI project and a Bun project get the same harness.

- Root `AGENTS.md`: the Stack section stops naming Bun, Express, Next, zod and the
  version pins; it says the stack is the set of generated packages, each described by
  its own `AGENTS.md`, with commands and ports in `.fullstack/catalog.yaml`. The
  Architecture section keeps only what holds for every stack (D4's contracts in short
  form, the contract flow, config from env, the error envelope, singular paths). The
  frontend layout, today in the root, moves into `frontend/next`'s agent file.
- Role agents (`backend`, `frontend`, `qa`, `reviewer`): descriptions and procedures name
  the package and its commands, not the framework. Lanes are unchanged.
- Skills: `api-design`, `database`, `error-handling` and `writing-tests` keep the
  procedure and the language-neutral rules (schema first, tests first, regenerate the
  contract in the same task, one repository per module, the status-code table, the
  envelope, what counts as a deleted test) and point at the package's `AGENTS.md` for
  the files and commands. A template's `AGENTS.md` therefore has, beyond the layer map
  and the "where does X go" table, short sections the skills refer to by name: "Adding a
  module", "Adding the data layer", "Errors", "Tests".
- `.doc/architecture.md` loses its hardcoded Next.js and Express sentences; the stack is
  recorded from the provenance file.
- `README.md`: the catalog is named, with the lock and the local-override flag.

Ordering across the two repositories: the harness change lands only after the catalog's
first tag, so `main` always bootstraps. Until the harness PR #1 (`feat/fullstack-capability`)
is merged, the catalog work does not depend on it: `base/` is copied from that branch's
`templates/`.

### D10. Versioning and releases

- Catalog releases are git tags `vMAJOR.MINOR.PATCH`. The major bumps when a manifest
  `schemaVersion` changes (the harness must be updated to consume it); the minor when a
  template, provider or capability is added; the patch for fixes. `v1.0.0` is deliberate
  and the rule applies from there: 1.0 means the harness consumes the catalog and one
  capability overlay has proven the mechanism end to end. Before it, `v0.x` tags are
  milestones.
- Each template has its own `version` and `CHANGELOG.md`; its major bumps when the
  generated layout changes in a way that would move files in an existing project.
- The README matrix is generated by `tools/validate --readme` from `index.yaml` so it
  cannot drift.

## Delivery order

Three milestones, each severable and each ending green.

1. **Catalog v0.1.0**: skeleton, schemas, `index.yaml`, `tools/validate` and
   `tools/generate`, `server/bun-express` and `frontend/next` with complete `base/` (the
   Next base is the pinned `create-next-app` output committed, not run at generation
   time; my call, for determinism and offline generation, refreshed by a documented
   procedure in CONTRIBUTING.md when Next is bumped), the `auth` flag with both cases,
   the `next-bun-express` stack, Compose assembly, provenance, `tools/test-generated`,
   CI, `docs/conventions.md`, `docs/capabilities.md`, README, CONTRIBUTING, LICENSE. Tag.
2. **Harness consumes the catalog**: `catalog.lock`, the thin bootstrap, the bootstrap
   skill's stack step, `templates/` removed, D9 applied, README. Proven by bootstrapping a
   scratch project from the cache and from a local override and running every gate in
   both packages plus e2e.
3. **First capability, catalog v1.0.0**: the `database/postgres` provider, the
   `bun-express` overlay, the generation case with services, the harness's data-layer
   branch (no backlog line when chosen). Tag; bump the harness lock.

After v1, in this order unless Eitan reorders: `server/python-fastapi`, then
`frontend/react` (Vite), giving the second stack `react-python-fastapi`; then
`shared/providers/database/mongodb` for both servers; then cache (redis); then
`worker/python-consumer` with messaging (rabbitmq) in pull mode.

## Left to the builder

- Exact JSON Schemas, the marker regexes and the error messages; whether the generator is
  one file or a small module per step.
- How `frontend/next`'s agent file coexists with the `AGENTS.md` that Next.js writes on
  `next dev`. Verify what Next 16.4 does when the file exists before choosing a name or a
  merge.
- The Compose fragment merge rules (service, volumes, networks; `depends_on` from
  capabilities to providers).
- The cases in each `tests/cases.yaml` beyond the minimum (`default`, `auth-off`,
  `postgres`).
- CI runner details (Bun setup action, Playwright browsers, Postgres as a service
  container versus Compose on the runner).
- Which dependency bot refreshes the committed lockfiles (Renovate or Dependabot), and
  its cadence.
- The wording of the stack-agnostic harness files, as long as no root file names a
  framework or a package manager command.

## Consequences

- Generating a project needs Bun even for a non-Node template. Accepted.
- Two repositories to keep in step: the lock makes the dependency explicit, and a
  harness change that needs a newer catalog bumps the lock in the same pull request.
- The harness's `templates/` history stays in git; the catalog starts from the branch's
  current files, not from the harness's history.
- The first non-TypeScript template will stress D4; its ADR amends `conventions.md`
  where the contract was TypeScript in disguise.
