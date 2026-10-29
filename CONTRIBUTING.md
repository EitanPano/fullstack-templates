# Contributing

## Prerequisites

- Bun 1.4 or newer.
- Node 24 or newer.
- git.
- uv 0.12.23 or newer, below 0.14, for the Python templates (`server/python-fastapi` declares
  that window in its `tools`). uv installs Python 3.14 itself; the generator checks each
  template's `tools` before it starts.
- Docker with Compose: provider-backed tests (`--with-services`) and the image smoke
  (`--with-app`) start containers. Every `check` command runs without Docker. The `single`
  deploy mode needs Compose 2.35.0 or later; the app smoke of a `single` case checks it first.

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
  [--flag k=v] [--capability k=v] [--deploy single|split] [--answers <file>] \
  [--template <kind/id>] \
  [--display-name <text>] [--brand-primary <hex>] [--brand-neutral <hex>] \
  [--radius sm|md|lg] [--font system|inter] [--theme system|light|dark] \
  [--density comfortable|compact] \
  [--skip-post-generate] [--keep-staging]
bun tools/test-generated.ts [--list] [--case <id>] [--e2e [--install-browsers]] \
  [--with-services] [--with-app] [--keep]
```

- `validate` checks the catalog (manifests, indexes, schemas, markers, placeholders, the
  pins of every overlay, the headings an `AGENTS.md` must have) and dry-runs every
  flag combination. `--readme` rewrites the generated matrix in `README.md`. `--lockfiles`
  also checks each template's lock in a scratch copy, so a manifest edited without
  refreshing its lock fails: `bun install --frozen-lockfile` for an `npm` template,
  `uv lock --check` for a `pyproject` one. `--pin` is described under "Keeping an overlay in
  step with the base". `validate` prints `validate: ok` and exits 0 when everything holds.
- `generate` builds a project from a stack, or from one template with `--template`.
  `--skip-post-generate` leaves out install, contract and format; `--keep-staging` keeps the
  working directory for inspection.
- The brand options (and `answers.brand`) apply to a frontend; `tools/lib/theme.ts` builds the OKLCH
  tokens and fails, naming the pair, when a seed cannot pass the contrast checks. A server-only
  plan ignores them.
- `test-generated` generates each case from every template's `tests/cases.yaml` and runs
  its gates. `--list` prints the cases, `--case` runs one, `--e2e` adds the e2e suite (`--install-browsers` first installs Playwright's Chromium in each generated package that has one) and
  `--keep` keeps the output. `--with-services` starts a case's provider services with
  `docker compose up -d --wait`, runs `migrate`, `check`, `testDb` (and e2e), then
  `docker compose down -v`; without it a case with providers runs `check` only.
  `--with-app` runs the app smoke for a case that sets `withApp: true` in its
  `tests/cases.yaml` (`stack-postgres` in both server templates, and `default`, `split` and `bun`
  in `frontend/react`, and `stack-postgres` in `frontend/next`), and skips it otherwise. A case's `deploy` field selects the deploy mode it
  generates and is smoked in.
  It exports throwaway production secrets in the child environment only, runs
  `docker compose --profile app up --build --wait` (which builds the images and runs the
  migrate service), checks the server's `http.health` and `http.ready` on the host, and always
  ends with `down -v`. For a stack with a static frontend it also checks the SPA shell, a deep
  link, the JSON 404, and the server's public directory (`single`) or a non-root frontend
  container (`split`), then, with `--e2e`, runs the frontend's e2e suite against the container
  with `E2E_BASE_URL`. CI passes `--with-services --with-app`. Run Postgres cases one at a time on
  one machine: they publish the database on host port 5432.

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

### Adding an SPA template

`frontend/react` is the model. The contract is
[docs/conventions.md › Frontend, single-page app](docs/conventions.md) (ADR 0003, M5-1); the checklist
below is what `validate` and the cases prove.

- [ ] The contract ([docs/conventions.md](docs/conventions.md),
      [ADR 0005](docs/adr/0005-frontend-foundation.md)): `src/app/` is routing only (`routes.tsx`, a
      root `layout` and `not-found`, and per route group a `loading` and an `error`);
      `src/main.tsx` mounts the router, the theme provider, the query client and the toaster and
      nothing else; the layers `widget/`, `feature/`, `entity/` and
      `shared/` with `api/` as the data layer; `src/shared/config/env.ts` the only reader of
      `import.meta.env`; the API reached at relative `/api` with no compiled-in URL and no CORS; the
      dev server proxies `/api` to the server's port.
- [ ] The foundation baseline files:
      - `components.json` (`ui` to `@/shared/ui`, `utils` to `@/shared/lib/cn`), the shadcn
        primitives in `shared/ui/`, the field bindings in `shared/ui/form/` and the patterns in
        `shared/ui/pattern/` (`AppShell`, `Page`, `PageHeader`, `EmptyState`, `ErrorState`,
        `AuthCard`, `UserMenu`, the skeletons);
      - `globals.css` with the OKLCH tokens, `THEME_LIGHT` and `THEME_DARK` in `:root` and `.dark`,
        and `@custom-variant dark`; a theme provider with a toggle in the `UserMenu`;
      - `shared/api/generated/` from `contract` (committed, never edited), `shared/api/client.ts`
        and `shared/api/call.ts`; the form schema extends the generated one;
      - `shared/lib/date.ts`, `shared/lib/cn.ts` and the mutation helpers;
      - `app/nav.ts`, the `(site)` route group, and with auth (`onlyWhen: { "server:auth": ... }`)
        the `(auth)` group, `shared/auth`, `feature/auth` and `entity/user`;
      - the example slices `entity/health`, `widget/system-status` and `feature/refresh-health`;
      - the `phone` and `desktop` projects in `playwright.config.ts` with
        `reuseExistingServer: false`, `RATE_LIMIT_SCALE`, the API's command chained as
        `e2eDb && start` (no `globalSetup`) and `retries: 0`.
- [ ] The tests the template owns: the field bindings, the shell nav, `call`, the action client or
      the mutation helpers, theme toggling and (with auth) the session helpers, every auth action's
      success and failure paths and a refresh that two concurrent 401s trigger once; the e2e
      `shell.spec` and `screens.spec`, and the auth journeys.
- [ ] The boundaries lint: `tests/unit/eslint-boundaries.test.ts` lints one violation and one allowed
      case per rule through ESLint's Node API and the real `eslint.config.mjs`, and each message
      names the layer to use instead.
- [ ] `static: { out: dist }` in `template.yaml`. Without it the server cannot serve the build and
      `--deploy single` is refused for the template. The app smoke proves that the `dist` target
      holds an `index.html`.
- [ ] A `Dockerfile` with two targets: `dist` (`FROM scratch`, the built files at `/dist`) for the
      server's image to copy in `single`, and `serve`, the last and so the default target, the
      static server of `split`. The nginx config, its security-header snippet and a
      `.dockerignore` sit beside it.
- [ ] A `compose.yaml` fragment per mode, the build-only pattern: the `single` variant is a
      `@single-start` ... `@single-end` block with `build: { context, target: dist }` and
      `scale: 0` (no ports, no `depends_on`, no profile); the `split` variant is a
      `@nosingle-start` ... `@nosingle-end` block with `target: serve`, the ports and the `app`
      profile, and its `environment` and `depends_on` lines marked `@server` so a lone frontend has
      none. In a fragment an app secret is `${NAME-}` (the runner generates it; the app refuses an
      empty one); an optional setting is `${NAME:-}` or `${NAME:-default}` (the runner never
      generates it; empty means unset). `single` is a reserved selection, true only with a server in the plan and
      `--deploy single`; `validate` dry-runs the file with it on and off.
- [ ] `base/AGENTS.md` has the headings `Adding a feature`, `Styling`, `Errors`, `Tests` and
      `Deployment`, matched exactly; `validate` checks them in every frontend template. The layer
      map is required by the contract but is not a checked heading.
- [ ] `tests/cases.yaml`: `default` (the stack in its default mode), a case with `deploy: split`, a
      case per other server in the catalog, and `alone` (the frontend generated by itself, which
      has no server, so its e2e is skipped). Set `withApp: true` on the cases that build images.
- [ ] A case that needs a server flag or a capability sets it from the frontend's own case (the
      `cases.schema.json` fields for the server's flags and capabilities): `stack-postgres`,
      `python` and `auth-off` in `frontend/next/tests/cases.yaml` are the model. A `withApp` case
      runs its production e2e against the image with `E2E_BASE_URL`.
- [ ] A `brand` case (non-default `answers.brand` values, as the `brand` case of each frontend sets
      them) runs every gate: the default-brand cases cannot catch a brand value that breaks a test
      or a contrast check.
- [ ] A `.conf` file (the nginx config) may carry markers, in `#` comments, and placeholders. A new
      file type that needs markers is added to `tools/lib/markers.ts` only: `placeholders.ts`
      derives its text types from it. A marker or placeholder in a file of a type neither knows
      fails generation and `validate`, naming the file.
- [ ] A stack in `stacks/` per server, an `index.yaml` entry and the README matrix
      (`bun tools/validate.ts --readme`).
- [ ] Proof: `bun tools/test-generated.ts --case frontend/<id>/default --e2e --with-app`, and the
      same for every other case that sets `withApp`. A case with a database needs Postgres on host
      port 5432: run those one at a time (see "The e2e database").

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
      a name the base already has is refused), `commands` (`testDb`, `migrate`, `e2eDb`),
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
- A frontend's selections include `server:<name>` for each flag and capability kind its stack's
  server selected (`server:auth`, `server:database`), all off when the frontend is generated alone.
  A template's `onlyWhen: { "server:auth": [paths] }` keeps those files only while it is on;
  `validate` dry-runs a frontend with each server selection on and off. A frontend manifest cannot
  declare a flag named `auth`, so `--flag auth=...` still means the server's.
- `server` (the plan has a server package) and `single` (the plan deploys as one image, which
  needs a server) are reserved selections; a manifest cannot declare a flag of either name.
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
`__PACKAGE_DIR__`, `__PORT__`, `__SERVER_DIR__`, `__SERVER_PORT__`, `__SERVER_DEV_COMMAND__` and
`__FRONTEND_DIR__` (the frontend's directory, for a server's Compose fragment). A frontend's e2e
config also gets `__SERVER_START_COMMAND__` (the server's `start` command),
`__SERVER_E2E_DB_COMMAND__` (its `e2eDb` command; empty without a database) and
`__SERVER_E2E_DATABASE_URL__` (the provider's `e2e` URL; empty without one). A frontend also gets
the brand placeholders `__PROJECT_DISPLAY_NAME__`, `__THEME_LIGHT__`, `__THEME_DARK__`,
`__THEME_RADIUS__`, `__THEME_DEFAULT__`, `__THEME_DENSITY__`, `__THEME_FONT__` and
`__THEME_FONT_STACK__` (the CSS blocks go into `globals.css`). A declared token left in the output
fails the run; undeclared tokens such as `__dirname` are ignored.

## Refreshing `frontend/next/base`

When Next is bumped:

1. Scaffold a clean app with the new version:

   ```sh
   bun x create-next-app@<version> frontend --ts --tailwind --eslint --app --src-dir \
     --import-alias "@/*" --use-bun --disable-git --no-agent-feedback --skip-install --yes
   ```

2. Delete the boilerplate SVGs.
3. Re-apply the overlay files and the placeholder edits from the current `base/`.
4. Check every pin against the registry (`npm view <pkg> time --json` and its peers; the latest
   stable at least 14 days old). The foundation pins are `@hey-api/openapi-ts`, `next-safe-action`,
   `@next-safe-action/adapter-react-hook-form`, `react-hook-form`, `@hookform/resolvers`, the
   shadcn CLI, `eslint-plugin-boundaries`, `next-themes`, `date-fns` and `@date-fns/tz`.
   `@hey-api/openapi-ts` is 0.x and a minor can change its output, so it moves only with a
   regenerated `generated/` that is read in the diff. ESLint stays at 9 while a plugin peers it.
5. Run `bun install` and commit `bun.lock`.
6. Add or update shadcn components with `bunx shadcn@<pin> add <name>` run in a generated project's
   package, never `shadcn init`; copy the result into `base/src/shared/ui/`, keep the
   `components.json` aliases, and replace palette literals with tokens. Diff the copied source
   against the previous copy: shadcn copies source, so an upgrade is a diff, not a version bump.
7. Regenerate `src/shared/api/generated/` with the template's `contract` command (Hey API) from a
   server template's `openapi.json`, and commit it.
8. Run `tests/unit/eslint-boundaries.test.ts`. It lints one violation and one allowed case per rule
   through the real `eslint.config.mjs`, so a new config block that overlaps a rule fails it.
9. Run `next dev` once so Next refreshes its block in `AGENTS.md`.
10. Run the production e2e for the Next cases:
    `bun tools/test-generated.ts --case frontend/next/default --e2e`, then `stack-postgres` with
    `--with-services --with-app`, `python` and `auth-off`. A Next build must pass with no API
    running (the request-time hole of ADR 0005, F8).
11. Bump the template `version` in `template.yaml` and `index.yaml`, and add a CHANGELOG
    entry.

## Refreshing `frontend/react/base`

When a dependency moves or the base is regenerated:

1. Verify every version on the registry; never write one from memory. The set is listed in
   [ADR 0003 › Versions](docs/adr/0003-spa-and-deploy-modes.md) and, for the foundation, in
   [ADR 0005 › Consequences](docs/adr/0005-frontend-foundation.md).
2. Keep the exceptions to "latest" unless the reason is gone:
   - ESLint 9 and TypeScript 5.9: `eslint-plugin-jsx-a11y` peers ESLint up to 9, and
     typescript-eslint requires TypeScript below 6.1.0. This matches `next`.
   - React 19.3.0: the version `next` pins, so one React runs across the frontends.
   - `react-router` is pinned exactly (8.5.0).
   - `@hey-api/openapi-ts` is pinned exactly (it is 0.x; a minor can change the generated output).
     The SPA adds its react-query plugin and `@tanstack/react-query`.
3. Run `bun install` and commit `bun.lock`; `bun tools/validate.ts --lockfiles` checks it with
   `--frozen-lockfile`.
4. Add or update shadcn components with `bunx shadcn@<pin> add <name>`, as for Next (step 6 there),
   adapting `Link` to `NavLink`; the Sheet is the phone nav.
5. Run the `contract` command when the server's contract moved, and commit
   `src/shared/api/generated/`.
6. Run `tests/unit/eslint-boundaries.test.ts`. It lints one violation and one allowed case per
   boundaries rule through the real `eslint.config.mjs`, so a new block that overlaps a rule fails
   it (ESLint flat config replaces a rule's options for a file with those of the last block that
   matches it, and does not merge them).
7. Bump `version` in `template.yaml` and `index.yaml`, add a `CHANGELOG.md` entry, and run
   `bun tools/validate.ts --readme`.
8. Re-run the react cases with the container smoke:
   `bun tools/test-generated.ts --case frontend/react/default --e2e --with-app`, then `split` and
   `bun`, `alone` (no `--with-app`), and
   `--case server/python-fastapi/stack-react-postgres --with-services --with-app`.

## The e2e database

A frontend's e2e suite never uses the development database. With a database provider (the
frontend's `server:database` selection), the Playwright config starts the server fresh
(`reuseExistingServer: false`) with the provider's `e2e` URL (`app_e2e`, in the provider's `env`
contract) and `RATE_LIMIT_SCALE=100`. The API's web server command is `<e2eDb> && <start>` (the
`__SERVER_E2E_DB_COMMAND__` and `__SERVER_START_COMMAND__` placeholders), because Playwright starts
web servers before any `globalSetup`. `E2E_DATABASE_URL` overrides the URL; a blank value counts as
unset, and the config refuses at load any URL whose database name does not end in `_e2e`.
Generation fails closed when a planned server lacks `commands.start`, or when `server:database` is
on without `commands.e2eDb` or a provider `e2e` URL; there is no silent fallback.

- `e2eDb` is an overlay `commands` entry, so it exists only with a database provider. It creates the
  database named by the `e2e` URL if it is missing, migrates it, and truncates every table except
  the migrations table. It refuses a database whose name does not end in `_e2e`, refuses a URL with
  a `dbname` query and checks `current_database()` before migrating.
- The database is created on demand rather than in `db/init.sql`, which runs only on a fresh
  volume and so would miss existing ones.
- `RATE_LIMIT_SCALE` (1 to 1000) multiplies every limit in `RATE_LIMITS`; production keeps 1; the
  e2e suite uses 100. There is no bypass switch.
- Container-mode e2e (`E2E_BASE_URL`, the case runner's Compose stack) starts nothing and runs at
  rate-limit scale 1. Against a long-lived stack it can run about once per 15 minutes and leaves
  its users in that stack's `app` database; the case runner does `up`, then `down -v`.
- To prove it, start the provider (`docker compose up -d --wait database`) and run a stack case with
  `--with-services`. The cases publish host port 5432, so run them one at a time and check that
  nothing else holds it. The name guard is the last line of defence, not the first: never point
  `e2eDb` at a database that is not yours.

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
  `schemaVersion` changes, the minor when a template, provider or capability is added or a template gains a feature
  (a template's own minor),
  the patch for fixes. `v0.x` tags are milestones before `v1.0.0`
  ([ADR 0001, D10](docs/adr/0001-catalog-architecture.md)).
- Each template has its own `version` and `CHANGELOG.md`; its major bumps when the
  generated layout changes in a way that would move files in an existing project. The frontend
  foundation ([ADR 0005](docs/adr/0005-frontend-foundation.md)) moves every frontend file, so
  `frontend/next` and `frontend/react` are 2.0.0.
- An optional field in a manifest, answers file, provenance or case schema keeps
  `schemaVersion: 1`: a file written before the field still validates. Only a change that makes an
  existing file invalid bumps it. v1.4.0 added optional fields (`answers.brand`, `onlyWhen`, the case
  fields for a server's flags, the `e2eDb` command, the provider's `e2e` URL); v1.4.1 adds the case
  field `brand`; v1.5.0 and v1.5.1 add none.
- This release is `v1.5.1`, a patch (a `.gitignore` fix: the Next-only lines moved to a `next` section), with `frontend/next` 2.1.1, `frontend/react` 2.1.1 and `server/bun-express` 2.4.2. The previous release, `v1.5.0`, a minor (a feature release of existing templates), had `frontend/next` 2.1.0, `frontend/react` 2.1.0 (axe,
  overflow and one-`h1` checks on every screen in both themes, the signed-in screens list, and a
  compact icon button), `server/bun-express` 2.4.1 and `server/python-fastapi` 1.2.1 (documentation). A template's `version` is bumped in
  `template.yaml`, `index.yaml` and its `CHANGELOG.md` together.
