# Contributing

## Prerequisites

- Bun 1.4 or newer.
- Node 24 or newer.
- git.
- uv 0.12.23 or newer, below 0.14, for the Python templates (`server/python-fastapi` declares
  that window in its `tools`). uv installs Python 3.14 itself; the generator checks each
  template's `tools` before it starts.
- Docker with Compose: provider-backed tests (`--with-services`) and the image smoke
  (`--with-app`) start containers. Every `check` command runs without Docker.

## Running the tools

Install the tools' dependencies once:

```sh
cd tools && bun install
```

Then, from the repository root:

```sh
bun tools/validate.ts [--readme] [--lockfiles]
bun tools/validate.ts --pin <template>/<kind>/<provider>
bun tools/generate.ts --stack <id> --out <dir> --name <name> \
  [--flag k=v] [--capability k=v] [--answers <file>] [--template <kind/id>] \
  [--skip-post-generate] [--keep-staging]
bun tools/test-generated.ts [--list] [--case <id>] [--e2e [--install-browsers]] \
  [--with-services] [--with-app] [--keep]
```

- `validate` checks the catalog (manifests, indexes, schemas, markers, placeholders, the
  pins of every overlay, the headings a server's `AGENTS.md` must have) and dry-runs every
  flag combination. `--readme` rewrites the generated matrix in `README.md`. `--lockfiles`
  also checks each template's lock in a scratch copy, so a manifest edited without
  refreshing its lock fails: `bun install --frozen-lockfile` for an `npm` template,
  `uv lock --check` for a `pyproject` one. `--pin` is described under "Keeping an overlay in
  step with the base". `validate` prints `validate: ok` and exits 0 when everything holds.
- `generate` builds a project from a stack, or from one template with `--template`.
  `--skip-post-generate` leaves out install, contract and format; `--keep-staging` keeps the
  working directory for inspection.
- `test-generated` generates each case from every template's `tests/cases.yaml` and runs
  its gates. `--list` prints the cases, `--case` runs one, `--e2e` adds the e2e suite (`--install-browsers` first installs Playwright's Chromium in each generated package that has one) and
  `--keep` keeps the output. `--with-services` starts a case's provider services with
  `docker compose up -d --wait`, runs `migrate`, `check`, `testDb` (and e2e), then
  `docker compose down -v`; without it a case with providers runs `check` only.
  `--with-app` runs the app smoke for a case that sets `withApp: true` in its
  `tests/cases.yaml` (`stack-postgres`, in both server templates), and skips it otherwise.
  It exports throwaway production secrets in the child environment only, runs
  `docker compose --profile app up --build --wait` (which builds the images and runs the
  migrate service), checks the server's `http.health` and `http.ready` on the host, and always
  ends with `down -v`. CI passes `--with-services --with-app`.

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

### A template that is not npm

`server/python-fastapi` is the model. What differs from an npm template:

- **The adapter.** `dependencies: { manifest: pyproject.toml, adapter: pyproject }`. The
  loader refuses `flags.<f>.dependencies` and a capability's `dependencies` and `scripts` for
  this adapter, with "use markers in pyproject.toml".
- **Dependencies are markers.** A dependency or a poe task that belongs to a flag or a provider
  is a line in `pyproject.toml` that ends in the marker, in TOML's `#` comment syntax:

  ```toml
  "pyjwt>=2.15",  # @auth
  "psycopg[binary,pool]>=3.3",  # @database:postgres
  ```

  The marker pass drops the lines whose name is off, as it does in source files, and the
  post-generate `install` re-locks the result.
- **Editing dependencies.** Edit `pyproject.toml` by hand, then run `uv lock` in `base/` and
  commit both. Do not use `uv add` or `uv remove`: they rewrite the line and can drop a
  trailing marker.
- **The superset lock.** `base/uv.lock` is resolved from the whole `pyproject.toml`, where every
  marked line is present. A generated project that drops a line re-locks, and uv prunes the
  dropped package and what only it needed without moving any other version.
- **`dropAfterPostGenerate`.** Paths removed from the staged package after post-generate and
  before the final move: for Python the `.venv` (a moved one still points at the staging
  directory) and the tool caches. The first `uv run` in the project creates a new one.
- **`tools`.** Each entry is `{ name, min }`. Before staging, when post-generate will run, the
  generator runs `<name> --version` and compares it with `min` (a bare major such as `'24'` is
  allowed). A missing or old tool fails with its name, the version found and the minimum.
- **Tree hygiene.** Copying and listing share one ignore set (`tools/lib/files.ts`) that
  covers `.venv`, `__pycache__` and the tool caches; a `.gitignore` fragment for the language
  goes in `shared/gitignore/` and is named in the manifest's `gitignore`.
- **The agents file** must have the headings the harness cites: "Adding a module", "Adding the
  data layer", "Errors" and "Tests". `validate` fails without them.
- **Where the gates run.** A raw `base/` that carries capability markers does not pass its own
  `check`: the marked lines import modules that only an overlay provides, and both variants of a
  marked line sit in the file until the generator picks one. This holds for `bun-express` and
  `python-fastapi` alike. The gates run in a generated project:
  `bun tools/test-generated.ts --case server/python-fastapi/default` generates the case and
  runs them (add `--with-services` for the database ones; `--list` prints the case ids).
  `--keep` leaves the project of a passing case and prints its path, to work in it.

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
      a name the base already has is refused), `commands` (`testDb`, `migrate`),
      `container` and `pins`. In a `pyproject` template the dependencies and tasks are
      markers in `pyproject.toml` instead, so there is no `dependencies` or `scripts`.
- [ ] `container.migrate` when the provider needs a schema (a database): the command the
      image runs once, as a program plus arguments with no shell (for example
      `python -m app.infra.scripts.migrate`). The generator derives from it a one-shot
      `<dir>-migrate` service in the root `docker-compose.yml`. It is the package's service with
      the same `build` and `environment`, that command, no ports, `restart: "no"`, profile
      `app`, and `depends_on` the provider's service with `service_healthy`. The package's
      service gains `depends_on: { <dir>-migrate: { condition: service_completed_successfully } }`,
      so `docker compose --profile app up --build` migrates before the server starts, and
      the server does not start when the migration fails. Two capabilities with
      `container.migrate` in one package are an error. The `migrate` command stays for local
      development.
- [ ] `overlay/`: the files that replace or join `base/`, at the same relative paths.
- [ ] The provider is listed in the template's `capabilities.<kind>.providers`.
- [ ] `pins`: every base file the overlay replaces, pinned (see below); run
      `bun tools/validate.ts --pin <template>/<kind>/<provider>` to write them.
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
reach a project generated with the capability unless the overlay copy gets it too. The
capability manifest therefore pins every base file its overlay shadows:

```yaml
pins:
  src/app/services/db.py: 08c5a463d54c1f1150b0ebb0b998e9db025a6208
```

A pin is git's blob id of the base file with CRLF read as LF, so Windows and Linux checkouts
agree. A file is shadowed when its path is in both `base/` and `overlay/`, unless the capability
lists it under a flag's `onlyPaths`. An `onlyPaths` entry must be a file only the overlay adds, so
the loader refuses one that also exists in `base/` (a flag that is off would delete the base file
too, and pins would not see it). `validate` fails when:

- a shadowed file has no pin;
- a pin names a file the overlay does not shadow;
- a pinned file's base has changed since the pin was written.

When a pull request changes a shadowed base file, reconcile the overlay copy by hand, then run:

```sh
bun tools/validate.ts --pin server/python-fastapi/database/postgres
```

`--pin` rewrites only the `pins` map of that `capability.yaml`. For each file whose pin moved
it prints `git diff <old pin> <new pin>`, the base change since the overlay was last reconciled,
so you can check the overlay copy has it. It writes the new blob into git's object database so
the diff works before you commit, validates nothing else, and cannot be combined with
`--readme` or `--lockfiles`. The pin only says the base moved: it never merges, so re-pinning
without reading the diff defeats it. Pins are checked by `validate`, not at generation.

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
`__PACKAGE_DIR__`, `__PORT__`, `__SERVER_DIR__`, `__SERVER_PORT__` and `__SERVER_DEV_COMMAND__`. A declared token
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

Every `base/` commits its lockfile, checked in CI by `validate --lockfiles`: a frozen
`bun install` for an `npm` template, `uv lock --check` for a `pyproject` one. `install` is plain
(`bun install`, `uv sync`), so a flag that drops packages prunes the lock in the generated
project.

The template supports uv 0.12 and 0.13. A lock written by 0.12.23 passes `uv lock --check` and
`uv sync --locked` under 0.13.1 (ADR 0002 M4-1), so the window is wider than one minor:

- CI installs uv 0.13.1 exactly (`astral-sh/setup-uv`, pinned by commit), so a run is
  reproducible;
- `pyproject.toml` declares `required-version = ">=0.12.23,<0.14"` (and the same range for
  `uv_build`), so a project generated from the template refuses a uv outside it;
- `template.yaml` declares `{ name: uv, min: '0.12.23', max: '0.14' }`; `max` is exclusive and
  the generator refuses a uv at or above it before it stages anything;
- the generated Dockerfile copies uv from `ghcr.io/astral-sh/uv:0.13`.

Moving the window to include uv 0.14 is a template minor: prove `uv lock --check` and
`uv sync --locked` under the new uv against the committed lock, change those places, and commit. To refresh a lock, run `uv lock` in `base/` (add
`--upgrade` to move versions) and commit it with `pyproject.toml`. A dependency bot to refresh
the lockfiles is still to be configured.

## Commits and versioning

- Conventional Commits: `type(scope): summary`, imperative, one intent per commit.
- Catalog releases are tags `vMAJOR.MINOR.PATCH`: the major bumps when a manifest
  `schemaVersion` changes, the minor when a template, provider or capability is added,
  the patch for fixes. `v0.x` tags are milestones before `v1.0.0`
  ([ADR 0001, D10](docs/adr/0001-catalog-architecture.md)).
- Each template has its own `version` and `CHANGELOG.md`; its major bumps when the
  generated layout changes in a way that would move files in an existing project.
