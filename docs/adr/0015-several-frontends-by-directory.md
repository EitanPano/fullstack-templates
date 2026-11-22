# ADR 0015: Several frontends, by directory, and the admin namespace

Status: accepted under the owner's word of 2026-11-22 ("complete your work", after the draft was
put to him; gate G2 of harness plan 030). The rulings in Context are his. The rows marked ▲ are
the session's, made from those rulings, and stand for his review at the `dev` → `main` merge.
Built by harness plan 030 on `feat/frontend-type`. Catalog release `v1.15.0`:
`serverless/cloudflare` 2.0.0 ([ADR 0016](0016-one-worker-with-static-assets.md)),
`frontend/astro` 1.1.0, a minor of `server/bun-express` and of `server/python-fastapi`. Amends
[ADR 0001](0001-catalog-architecture.md) (a plan holds one frontend),
[ADR 0011](0011-frontend-without-a-server.md) (a stack joins a lone frontend at its own
directory) and [ADR 0014](0014-astro-cloudflare-pages.md) (K4's `FRONTEND_PATH`).

## Context

- A plan holds one frontend today: `tools/lib/plan.ts` keeps one `frontendDir`, a stack names
  the frontend's directory, and `serverless/cloudflare` assembles one build.
- A product on the stack `astro-cloudflare` needs three: a public site, an owner console (built
  inside the site's package, split off by host in the server's middleware) and a signed-in
  customer app to come.
- The owner's rulings of 2026-11-22, in order:

  | Ruling |
  | --- |
  | Several frontend packages; the rules stay in each package's guide, not in a root table |
  | "Instead of naming it frontend, rename it to the relevant service type" |
  | The types are `site`, `platform`, `app` and `admin` |
  | "Each app should be named `app-<toolName>/`" when a product has several |
  | "Only the `/api/admin/` folder should hold the admin related APIs", "on all server types" |
  | One request argument in the generator, the bootstrap and `scaffold`: `--frontend <dir>=<template>` |
  | An admin call stays in every frontend's generated client; no client filter |

## Decisions

### F1. The request

- `generate` takes a repeatable `--frontend <dir>=<template>`.
- **With `--stack`**, the listed frontends take the place of the stack's frontend member, in the
  order given. ▲ Each must use the stack's own frontend template: another template beside the
  same API is a pairing no case has run, and arrives as a later decision (the customer app).
- **Without `--frontend`** a stack generates as it does today, its frontend at the stack's `dir`.
  Every project that exists, and every case, rebuilds byte for byte. The stacks keep
  `dir: frontend` for that reason.
- **Alone**, one `--frontend` is `--template <template> --dir <dir>`, which stays. ▲ Several
  frontends with no API package are refused: nothing serves them together yet.
- ▲ **A second frontend beside a `server` package is refused**, with the reason: the `single`
  deploy mode serves one build and no Compose case has run two.

### F2. The plan

- `GenerationPlan` holds its frontends as a list; `PackagePlan.frontendDir` goes.
- Each frontend still gets `SERVER_DIR` and `SERVER_PORT`. ▲ The API package gets a `FRONTENDS`
  placeholder, a JSON list of `{ dir, path, out, port }` in request order, and `FRONTEND_HOSTS`,
  the local host map (`<dir>.localhost=<dir>`, comma-separated). `FRONTEND_PATH` and
  `FRONTEND_OUT` stay and name the first frontend. A reserved selection `frontends` (the plan
  holds more than one) exists for the API package and for a frontend package.
- ▲ With several frontends a directory with a slash is refused: it becomes a host name and a
  folder of `dist/`.
- **Ports (▲).** A frontend keeps its template's dev port; one whose port is taken gets the next
  free port above it, in request order. Provenance records it, and a `PORT` placeholder gives a
  template its own.
- **Flags.** A flag two packages declare (`islands` on two Astro frontends) is already refused
  as a shorthand and set per directory in the answers file. Nothing changes.
- **Brand.** One brand serves every frontend of a plan.
- Provenance keeps its shape: one entry per directory, in request order, so a rebuild passes
  the same list.

### F3. The directory names

- The generator takes any directory `DIR_PATTERN` allows.
- The four types are a convention, written in `docs/conventions.md`; the harness holds new
  projects to it and proposes the type. ▲ No tool changes behaviour by type, and the type
  restricts no template.

| Directory | What it is | Search | Sign-in |
| --- | --- | --- | --- |
| `site` | Public pages: marketing, content, documentation | Indexed | None |
| `platform` | A public-first product with optional sign-in | Indexed | Optional |
| `app`, or `app-<tool>` when there are several | The signed-in customer product | noindex | Required |
| `admin` | The back-office for staff; calls `/api/admin/*` | noindex | Required, elevated |

### A1. The admin namespace, in every server template

- Every admin endpoint has a path under `/api/admin/` and lives in `api/admin/<module>/`. No
  admin route sits in an entity's module. `admin` is a namespace, not an entity:
  `/api/admin/lead` keeps the singular name after it.
- **One gate guards the prefix**, mounted with the namespace and first in its chain, so a new
  admin route cannot ship without it. It is the same in every environment.
- ▲ **The gate as shipped.** With the server's `auth` flag it is the role gate. Without accounts
  it refuses every request (403) until the product writes its own; the guide carries the recipe
  (for Cloudflare, the Access token check ADR 0014 left to the guide).
- The boundary lint takes `api/admin/<module>/` as a module: it reaches an entity's data through
  that entity's controller, as any module does.
- Authorisation is the server's. No frontend rule is a security boundary.

## Alternatives considered

- **A `frontend/<surface>/` tree and a rules table in the root guide.** The owner's first sketch.
  It nests packages, which the harness's lanes drop, and restates what manifests record.
- **One package split by host.** What the product does today: no tool change, console code on
  the public origin, and a poor fit for a signed-in app.
- **A `type:` line in provenance.** A second source for what the directory already says.
- **A typed `dir` in the stack file.** It would move every existing project's rebuild.
- **A generated client without `/api/admin/*`.** A bundler already drops calls nobody imports;
  the gain left is a compile error, for a flag in five templates. The owner ruled it out.

## Consequences

- A project grows a frontend by need, as it grows a server (ADR 0011).
- The same template can appear twice in a plan, which no tool assumed before: ports and flags
  are per directory.
- A stack is no longer the whole list of a project's packages; the stack and the request are.
- ▲ The gate does not answer first on a body that is not valid JSON: both servers decode the body
  before the gate runs, so an anonymous caller gets the 400 `validation_failed` envelope there,
  not the gate's 401 or 403; no admin handler runs and the envelope names no route.

## Out of scope

A second frontend beside a `server` package. A shared code package. A second `site`, `platform`
or `admin`; an API namespace per app. A frontend template the stack does not name. Sign-in on
`serverless/cloudflare`. A rename command.
