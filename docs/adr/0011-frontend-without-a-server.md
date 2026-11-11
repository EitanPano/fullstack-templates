# ADR 0011: A frontend without a server

Status: accepted on the session's reading of Eitan's "start plan 024" (2026-11-11), which
carries the program he approved on 2026-11-10 (decision 3, "scaffold by need"). The rows marked
▲ are the session's, made while writing this record, and stand for his review at G4. Built by harness plan 024 on `feat/scaffold-by-need`. Catalog release
`v1.11.0`: `frontend/next` 3.1.0, `frontend/react` 5.1.0, `frontend/vue` 3.1.0,
`frontend/angular` 3.1.0; the servers are unchanged. Amends
[ADR 0003](0003-spa-and-deploy-modes.md) (a lone frontend has no deploy mode and no Compose
file) and [ADR 0006](0006-per-framework-frontends-and-angular.md) (invariant 1: the generated
contract types exist only with a server).

## Context

- The harness comparison run of 2026-11-10 built a Trello mock from a brief that asked for
  localStorage only. It shipped an unused `backend/` and a `docker-compose.yml`, because every
  stack is a fixed frontend and server pair and the harness runs the generator once.
- `--template frontend/<id>` already generates a frontend alone (the `alone` case), but the
  result is not a product a team would keep:
  - it carries the typed client generated from the template's own sample contract, the
    `openapi-ts` config, the `api:types` script and its dependencies, the API environment
    variables, the dev proxy and the e2e API web server;
  - its provenance records a `contract` command the project cannot run;
  - the `SERVER_*` placeholders fall back to a server that does not exist
    (`tools/lib/generate.ts`, `DEFAULT_SERVER`);
  - the `alone` case skips its e2e (`tools/lib/run-case.ts`), so nothing proves the app runs.
- `onlyWhen` keys a file on `server:<flag or kind>`. Nothing keys on the bare fact that a
  server exists, and an `onlyWhen` entry can remove files but not dependencies or scripts.
- The harness (plan 024) adds a part later by generating the project twice at the pinned
  catalog, before and after the part, and applying the difference as a three-way merge. That
  works only if a frontend generated alone is a true subset of the same frontend in a stack, and
  if a generation is a pure function of the recorded selection.

## Decisions

### D1. `server` is a selection a frontend can key on

- `onlyWhen` accepts the bare key `server` beside `server:<name>`: the listed paths exist only
  when the plan has a server package. The marker `@server` already exists (`SERVER_SELECTION`
  in `tools/lib/plan.ts`); the manifest key joins it.
- ▲ **An `onlyWhen` value is a path list, as today, or an object** `{ onlyPaths, dependencies,
  scripts }`. `dependencies.remove` names packages removed from the template's dependency
  manifest when the selection is off, exactly as `flags.<f>.dependencies.remove` does
  (`tools/lib/dependencies.ts`). `scripts.remove` names `package.json` scripts removed the same
  way. A selection only removes; it never adds a dependency or a script. The pyproject adapter
  refuses both, as it does for flags.
- The loader checks that every removed dependency and script exists in `base/`, and that no flag
  of the same template removes the same name.

### D2. What a frontend keys on `server`

Per template, every file or line that exists only to reach the server:

| Part | Gated by |
| --- | --- |
| The generated client tree (`services/generated/`, Next `shared/api/generated/`) and `openapi-ts.config.ts` | `onlyWhen: server` paths |
| The client wrapper, the error-envelope models and their copy tables, the data-layer specs | `onlyWhen: server` paths, or `@server` markers in shared files |
| The `api:types` script and `@hey-api/*` packages | `onlyWhen.server.scripts` and `.dependencies` |
| The API variables in `.env.example` and the env module | `@server` markers |
| The dev proxy (Vite `server.proxy`, Angular `proxy.conf.json`), the production web server's `/api` upstream, the service worker's `/api` rules | paths or `@server` markers |
| The e2e API web server, the e2e database helpers, `smoke.spec`'s `GET /api/health` request | `@server` markers (the database helpers stay under `server:database`) |

- The rule a builder applies: a file belongs to `server` when it imports the generated client,
  reads an API address, or asserts a response of the server. Everything else stays: the UI kit,
  the page pattern, routing, theme, brand, i18n and pwa without their `/api` entries.
- ▲ **The `alone` case is the net.** Its `check` fails on an import of a removed file, and the
  generator defines no `SERVER_*` placeholder for a plan without a server, so a kept file that
  uses one fails the generation and names itself. A missed file shows up in CI rather than in a
  project.

### D3. The generator for a plan with no server

- ▲ **No `contract` command is recorded** for a frontend in a plan without a server: the
  command leaves `commands` in the plan, so provenance, the case runner and the harness never
  see it. `postGenerate` already skips it (`contractSkipped`).
- **No `docker-compose.yml`** is written for a plan without a server. A lone frontend still
  ships its Dockerfile; it deploys as its own image or to a static host (ADR 0003's `split` side
  without the server).
- ▲ `DEFAULT_SERVER` stays only for the marker dry-run; generation without a server gets no
  `SERVER_*` value (D2's net).
- A plan with a server is unchanged: the same files, byte for byte. This is what lets a part be
  added later as a difference between two generations.

### D4. A generation is a function of its recorded selection

- ▲ Generating with the selection recorded in `.fullstack/catalog.yaml` (`stack` or the lone
  template, per package `flags` and `capabilities`, `deploy`, `answers.projectName`,
  `answers.brand`) at the recorded catalog commit reproduces the generated files, `generatedAt`
  and the lockfiles aside. The harness's spike S1 proves it on two bootstrapped projects; a
  difference found is fixed in the generator, not tolerated in the harness.
- ▲ A lone frontend's directory is `frontend`, the directory every stack gives its frontend, so
  a later `--stack` generation keeps its path.

### D5. Tests

- The `alone` case runs its e2e. Its Playwright config starts only the frontend; `smoke.spec`
  checks the index route's one `h1` and axe; `shell.spec` and `screens.spec` run as in a stack.
- Vue and Angular add `alone-lean`: the frontend alone with `i18n` and `pwa` off, the smallest
  project the harness scaffolds for a brief that needs neither.
- Tools tests: the bare key and the object form in the schema and the loader; dependency and
  script removal; no `contract` command and no Compose file without a server; a stack plan's
  output unchanged (the existing fixture snapshots).

### D6. Documents

- Each frontend's `AGENTS.md` names what arrives with a server, in one short list under its
  existing data-layer heading, and says the harness adds it (`scripts/scaffold.mjs`), never a
  hand copy.
- `docs/conventions.md`: invariant 1 reads "with a server, the frontend's types come from its
  contract". `CONTRIBUTING.md`'s manifest reference documents the bare key and the object form.

### D7. Release

Minor versions (a lone frontend is a new, smaller output; a stack's output is unchanged):
`frontend/next` 3.1.0, `frontend/react` 5.1.0, `frontend/vue` 3.1.0, `frontend/angular` 3.1.0;
catalog `v1.11.0`. The tag is Eitan's.

### D8. The harness (plan 024)

The harness's `scripts/scaffold.mjs` adds a part (a server with the frontend's typed client, a
flag, a capability) by generating BASE (the recorded selection) and NEXT (plus the part) at the
pinned catalog and merging BASE → NEXT into the project. Its bootstrap scaffolds a frontend
alone when the brief needs no server yet. Neither needs another catalog change.

## Alternatives considered

- **A `server` flag on each frontend.** It duplicates a fact the plan already has and lets a
  stack generate a frontend that ignores its own server. Rejected.
- **A generator `--add` mode that edits an existing project.** The generator never edits an
  existing file (it keeps a present Compose service as it is); teaching it to merge moves the
  harness's job into the catalog and still needs a three-way merge. Rejected for the harness's
  two-generation merge.
- **Keep the typed client in a lone frontend, unused.** Smaller change, but it ships dead code
  and a `contract` command that fails. Rejected.

## Consequences

- A brief that needs no server yields a frontend, `.fullstack/`, `.editorconfig` and
  `.gitignore`: no `backend/`, no Compose file, no Docker for `verify`.
- Adding a server later changes the frontend's files only by what D2 lists, so the three-way
  merge touches few product files.
- Every new server-coupled file in a frontend must be keyed on `server`; the `alone` case fails
  when one is not.

## Out of scope

Next's tree and styling (ADR 0012). Removing a part. Worker packages. A server added to a
frontend generated before v1.11.0 (its provenance names a lone template that still carries the
client; the harness refuses a lock that differs from provenance).

## Spike (the harness's, before the build)

- **S1. Round trip.** Regenerate two bootstrapped projects (one stack, one with
  `database=postgres` and a non-default brand) from their provenance at the recorded commit;
  the difference is `generatedAt` and lockfiles only. Failure is a stop.

## Decisions made while building

- **The placeholder net (rulings R7).** The old sweep checked only the placeholders a template
  declares, and real templates declare only `PROJECT_NAME`, so it never saw a leftover
  `__SERVER_DIR__`. `tools/lib/placeholders.ts` names the `SERVER_*` set, and a plan without a
  server sweeps for it.
- **A rerun keeps its Compose service.** D3's "no `docker-compose.yml` without a server" holds
  for a fresh generation. A lone frontend generated into a folder that already has a Compose
  file still adds its service, as every rerun does; the harness generates into empty folders,
  so its two generations never meet this case.
