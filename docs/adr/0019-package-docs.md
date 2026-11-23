# ADR 0019: A package's `AGENTS.md` is the template's, its `.doc/` is the project's

Status: accepted under the owner's word of 2026-11-24 (the release round, released as `v1.17.0`).
The decisions are the owner's rulings of 2026-11-23; the rows marked ▲ are the session's. Catalog
release after `v1.16.1`, in the round of [ADR 0018](0018-entity-term-and-service-facades.md): no
template takes a second bump, each touched template's entry for that release gains a line.

## Context

A package's `AGENTS.md` is the layer map an agent loads in a generated project. Five templates
also told a task to write into it:

- `frontend/astro`, `Adding a feature` step 8: "This file and the README's Features: say what the
  page does."
- `frontend/react`, `frontend/next`, `server/bun-express` and `server/python-fastapi`: a role
  change lists "this file" among the places to update.

A project built on `astro-cloudflare` (one frontend, one Worker, 36 plans in five days) showed
where that leads. Both package files reached about 6,700 words of template rules mixed with
product facts, and the project split them into twelve nested guides with size tests of its own.
A template update could no longer be compared with the file it replaces.

The owner, 2026-11-23: "each root-module: frontend / sdk / backend (server/serverless) - should
have their own LLM-related .md folder/file structure", in "`<package>/.doc/`".

## Decisions

### P1. `AGENTS.md` is the template's

No step in a template tells a task to edit the package's `AGENTS.md`. A project changes it by a
template update or by a deliberate edit of a rule, never as a record of what a task built.

### P2. `<package>/.doc/` is the project's

What is true for one package and comes from the product lives in the package's own `.doc/`:

- every package, `architecture.md`: what the product put in the package, and its change log;
- every frontend also `design.md`: the rules of its look.

A task records a feature as one change-log line there that cites its plan, and in the README's
Features. The description stays in the plan.

### P3. The harness seeds it, the catalog ships none

No template has a `base/.doc/`. The harness writes the skeleton files into a package when it
creates it and never writes them again.

- ▲ A package generated without the harness has no `.doc/`; a template line that names a file
  there is followed by creating it.

### P4. The spelling

In a template's text `.doc/…` always means the repository's root folder (`.doc/glossary.md`).
The package's own folder is written with the words "this package's" before the path (this
package's `.doc/architecture.md`), never a bare `.doc/…` and never a path with the package's
directory.

### P5. What the five templates say instead

- Astro's step 8: the README's Features and the change-log line.
- The role-change lines: the role list in this package's `.doc/architecture.md`.

## Alternatives considered

- **Each template ships `base/.doc/`.** A package describes itself. Refused: eight copies of one
  format to keep alike, a format change needs a catalog release, and a template update can
  conflict with what the project wrote.
- **No skeleton, the template describes the format.** Refused: without markers the harness's
  "ask before planning" gate cannot fire; it is how an ad hoc design file appeared.
- **Files at the package root (`DESIGN.md`).** Refused: the root fills up, and there is no one
  folder to name.
- **Root `.doc/<package>/`.** Refused: a package's doc does not move with its package.

## Consequences

- A project generated before this release still reads "this file" in its package's `AGENTS.md`.
  Nothing rewrites it; each touched template's changelog names the line to change by hand.
- `CONTRIBUTING.md` and `docs/conventions.md` carry P1 as a rule for a template author.
- Each Bun template's `check` formats Markdown, so a seeded file is checked like the package's
  `AGENTS.md`; `server/python-fastapi` formats none. The harness ships its skeletons formatted.
- No `validate` check enforces P1 yet: the eight agents files were swept by hand.

## Out of scope

- An `sdk` package kind. The rule is per package, so it would inherit `.doc/`.
- Brand answers per frontend in the generator (`answers.brand`): one set per product stays.
- Nested guides beside feature code and size tests in a package.
- The harness's own text, which its plan 032 carries.
