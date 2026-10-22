# Contributing

## Prerequisites

- Bun 1.4 or newer.
- Node 24 or newer.
- git.
- Docker, later: provider-backed tests (a database, a cache) need it once those overlays
  exist. Every `check` command runs without Docker.

## Running the tools

Install the tools' dependencies once:

```sh
cd tools && bun install
```

Then, from the repository root:

```sh
bun tools/validate.ts [--readme] [--lockfiles]
bun tools/generate.ts --stack <id> --out <dir> --name <name> \
  [--flag k=v] [--capability k=v] [--answers <file>] [--template <kind/id>] \
  [--skip-post-generate] [--keep-staging]
bun tools/test-generated.ts [--list] [--case <id>] [--e2e [--install-browsers]] [--keep]
```

- `validate` checks the catalog (manifests, indexes, schemas, markers, placeholders) and
  dry-runs every flag combination. `--readme` rewrites the generated matrix in `README.md`.
  `--lockfiles` also runs `bun install --frozen-lockfile` against each npm template's `base/package.json` and `bun.lock` in a scratch copy, so a manifest edited without refreshing its lock fails.
  It prints `validate: ok` and exits 0 when everything holds.
- `generate` builds a project from a stack, or from one template with `--template`.
  `--skip-post-generate` leaves out install, contract and format; `--keep-staging` keeps the
  working directory for inspection.
- `test-generated` generates each case from every template's `tests/cases.yaml` and runs
  its gates. `--list` prints the cases, `--case` runs one, `--e2e` adds the e2e suite (`--install-browsers` first installs Playwright's Chromium in each generated package that has one) and
  `--keep` keeps the output.

## Adding a template

Checklist, under `<kind>/<id>/` (for example `server/bun-express`):

- [ ] `template.yaml`, valid against `schemas/template.schema.json`.
- [ ] `base/`: the complete, runnable package with its lockfile committed.
- [ ] `compose.yaml`: the service body that goes into the project's `docker-compose.yml`.
- [ ] `AGENTS.md` inside `base/`: the layer map the agents load in that package.
- [ ] `README.md` and `CHANGELOG.md`; the manifest `version` and the changelog agree.
- [ ] `tests/cases.yaml`: each flag alone, each capability alone, each capability with
      every flag off.
- [ ] An `index.yaml` entry with the same summary and version as the manifest.
- [ ] `bun tools/validate.ts --readme`, then `bun tools/validate.ts` green.
- [ ] Every case green locally: `bun tools/test-generated.ts`.

A manifest `commands` entry is a program plus whitespace-separated arguments, run without a
shell: no pipes, redirects, quoting, variables or command substitution (the schema rejects
`& | ; < > ' " $` and backticks). Put anything more elaborate in a script and call that.

### Markers and placeholders

Markers are written in the file's own comment syntax (`//`, `#` or `<!-- -->`, chosen by
extension or file name) and name a flag or a capability:

- `@<name>` at the end of a line keeps that line only when `<name>` is on; `@no<name>`
  keeps it only when `<name>` is off.
- `@<name>-start` and `@<name>-end` (or `@no<name>-start` ... `@no<name>-end`), each on a
  line of their own, wrap a block. Blocks do not nest.
- Names match `[a-z][a-z0-9-]*(:[a-z0-9-]+)?`; the optional `:<provider>` part targets one
  provider of a capability.
- A name that no flag or capability declares fails validation, as does an unbalanced block
  or a marker left in generated output. `validate` dry-runs the marker pass for every flag
  combination; `test-generated` proves each declared case generates and passes its gates.

```ts
const sessions = createSessions() // @auth
// @noauth-start
const sessions = null
// @noauth-end
```

Placeholders are `__NAME__` tokens substituted in text files. A template declares its own
in `placeholders` (usually `__PROJECT_NAME__`); the generator also provides
`__PACKAGE_DIR__`, `__PORT__`, `__SERVER_DIR__` and `__SERVER_PORT__`. A declared token
left in the output fails the run; undeclared tokens such as `__dirname` are ignored.

## Refreshing `frontend/next/base`

When Next is bumped:

1. Scaffold a clean app with the new version:

   ```sh
   bun x create-next-app@<version> frontend --ts --tailwind --eslint --app --src-dir \
     --import-alias "@/*" --use-bun --disable-git --no-agent-feedback --skip-install --yes
   ```

2. Delete the boilerplate SVGs.
3. Re-apply the overlay files and the placeholder edits from the current `base/`.
4. Run `bun install`.
5. Regenerate `src/lib/api/schema.d.ts`.
6. Run `next dev` once so Next refreshes its block in `AGENTS.md`.
7. Bump the template `version` in `template.yaml` and `index.yaml`, and add a CHANGELOG
   entry.

## Lockfile policy

Every `base/` commits its lockfile, frozen in CI (`validate --lockfiles`). `install` is plain `bun install`, so a flag that drops
packages prunes the lock in the generated project. A dependency bot to refresh the
lockfiles is still to be configured.

## Commits and versioning

- Conventional Commits: `type(scope): summary`, imperative, one intent per commit.
- Catalog releases are tags `vMAJOR.MINOR.PATCH`: the major bumps when a manifest
  `schemaVersion` changes, the minor when a template, provider or capability is added,
  the patch for fixes. `v0.x` tags are milestones before `v1.0.0`
  ([ADR 0001, D10](docs/adr/0001-catalog-architecture.md)).
- Each template has its own `version` and `CHANGELOG.md`; its major bumps when the
  generated layout changes in a way that would move files in an existing project.
