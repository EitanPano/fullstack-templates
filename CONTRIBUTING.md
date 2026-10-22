# Contributing

## Prerequisites

- Bun 1.4 or newer.
- Node 24 or newer.
- git.
- Docker with Compose: provider-backed tests (`--with-services`) start the provider's
  service. Every `check` command runs without Docker.

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
bun tools/test-generated.ts [--list] [--case <id>] [--e2e [--install-browsers]] [--with-services] [--keep]
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
  `--keep` keeps the output. `--with-services` starts a case's provider services with
  `docker compose up -d --wait`, runs `migrate`, `check`, `testDb` (and e2e), then
  `docker compose down -v`; without it a case with providers runs `check` only.

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

## Adding a provider

A provider is one implementation of a capability, described once for every language
(`shared/providers/<kind>/<id>/`). Checklist:

- [ ] `provider.yaml`, valid against `schemas/provider.schema.json`: `kind`, `id`, `name`,
      `service` (the Compose service name), `compose` (the file below), `env` and `files`.
- [ ] `compose.yaml`: a partial Compose document, a `services` map that defines `service`
      with a healthcheck that is true only when the service is ready for connections, and
      the `volumes` it needs. Credentials in it are for local development only.
- [ ] `env`: one entry per variable, with a `summary` (it becomes the `.env.example`
      comment) and the `local`, `compose` and `test` values (one line, none of newline, `$`, braces,
      quotes or backslash). Mark a credential `secret: true` so Compose wires it with no default,
      and name the variable that overrides the test value in `testOverride`.
- [ ] `files`: what is copied to the project root when absent, such as `db/init.sql` (which
      must create the test database).
- [ ] At least one template lists the provider and ships its overlay; `validate` fails a
      provider no template uses.

## Adding an overlay

An overlay binds one provider to one template, in
`<kind>/<id>/capabilities/<capability>/<provider>/`. Checklist:

- [ ] `capability.yaml`, valid against `schemas/capability.schema.json`: `kind`, `provider`,
      `summary`, and as needed `dependencies`, `scripts` (lines for the package manifest;
      a name the base already has is refused) and `commands` (`testDb`, `migrate`).
- [ ] `overlay/`: the files that replace or join `base/`, at the same relative paths.
- [ ] The provider is listed in the template's `capabilities.<kind>.providers`.
- [ ] A change to a base file that an overlay replaces updates the overlay copy in the same
      pull request (see below).
- [ ] Shared files carry markers where the two variants differ: `@<kind>` (any provider),
      `@no<kind>` (none) or `@<kind>:<provider>` at the end of a line, or the `-start` and
      `-end` forms around a block. Keep the no-capability variant byte for byte what it was.
- [ ] A file that only makes sense with a flag on lives under that flag's `onlyPaths` in the
      template, or is listed in the capability's `flags.<name>.onlyPaths` (for a new file the
      base lacks); the generator copies overlays before it removes both, so `auth=false`
      drops it.
- [ ] Two cases in `tests/cases.yaml`: the capability alone at the default flags, and the
      capability with every flag off (`validate` fails without them).
- [ ] `bun tools/test-generated.ts --case <id> --with-services` green for both: migrate,
      `check`, `testDb`.
- [ ] The template's `AGENTS.md` describes the variant, its `README.md` and `CHANGELOG.md`
      follow, and the version is bumped in `template.yaml` and `index.yaml`.

### Keeping an overlay in step with the base

An overlay file replaces the base file at the same path, so a fix to the base file does not
reach a project generated with the capability unless the overlay copy gets it too. A pull
request that changes a base file an overlay replaces updates that overlay copy in the same
pull request. For `server/bun-express` with `database/postgres` the shadowed files are:

- `src/api/module/service.ts`
- `src/api/user/service.ts`
- `src/services/db.ts`
- `src/services/session.ts`
- `tests/store.ts`
- `tests/services/session.test.ts`

List them for any overlay as the paths present in both `base/` and `overlay/`:

```sh
cd server/bun-express
comm -12 <(cd base && find . -type f -not -path './node_modules/*' | sort)   <(cd capabilities/database/postgres/overlay && find . -type f | sort)
```

Pinning the base file's hash in the capability manifest, so `validate` flags a drift, is a
follow-up.

### Markers and placeholders

Markers are written in the file's own comment syntax (`//`, `--` in `.sql`, `#` or
`<!-- -->`, chosen by extension or file name) and name a flag or a capability:

- `@<name>` at the end of a line keeps that line only when `<name>` is on; `@no<name>`
  keeps it only when `<name>` is off.
- `@<name>-start` and `@<name>-end` (or `@no<name>-start` ... `@no<name>-end`), each on a
  line of their own, wrap a block. Blocks do not nest.
- Names match `[a-z][a-z0-9-]*(:[a-z0-9-]+)?`; `@database` is true when any provider of the
  capability is selected and `@database:postgres` when that provider is; the `no` prefix
  negates either.
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
