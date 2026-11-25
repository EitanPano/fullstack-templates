# sdk/browser

An embeddable browser SDK ([ADR 0020](../../docs/adr/0020-sdk-kind.md), changed by
[ADR 0021](../../docs/adr/0021-sdk-units.md)): other sites load it from a `<script>` tag or install
it from npm. A page mounts a unit of a module with `mount` (inline) or `open` (a modal dialog), or marks an
element for it (a slot);
the unit is drawn in a sandboxed iframe from the API's origin, and the page is told `rendered`,
`closed`, `error` and the module's own events. The kernel reads a kill switch from the server's
`/api/sdk/v1/config`. No runtime dependency; no module ships (a feature is added with the recipe in
the package's `AGENTS.md › Adding a feature`). A module is a declaration on the host page and a
frame half. The frame half calls an entity the server mounts behind `frameOnly` with `ctx.request`
and sends telemetry with `ctx.track`; the lint refuses `href`, `src` and `srcdoc` set by
`setAttribute` or by assignment.

Generated with `--sdk <dir>=sdk/browser` beside any stack's API package; the harness names the
directory `sdk-<name>`. The package is not a frontend: no static build, no brand, no pages. Its
playground port is 5190 and the global its CDN loader sets is the directory's last segment in
PascalCase with `sdk-` dropped and `Sdk` added if it is not there (`sdk-ads` gives `AdsSdk`); the
attribute of a slot is `data-` and the global's name in kebab case (`data-ads-sdk`).

## Layout

- `template.yaml`: the manifest (commands, contract, playground port, `cdn.out`).
- `base/`: the files copied into the package: `src/` (`entries`, `core`, `transport`, `contract`,
  `protocol`, `ui`, `frame`, `modules`), `tests/` (unit, e2e specs, host pages and the screens list,
  consumers, a fixture module), `scripts/` (size, API report, pack lint, consumers, playground),
  `playground/`, `Dockerfile`, `bun.lock`, the committed `src/contract/` and `etc/sdk.api.txt`.
- `base/Dockerfile`: the `dist` target holds `dist/cdn` at `/sdk` for the server's image: one folder
  per major, `v<major>/loader.js`, `frame.js`, `frame.css` and `frame.html`, which the API package
  serves under `/api/sdk/`.
- `compose.yaml`: a build-only service (the server's `additional_contexts` reads it).
- `tests/cases.yaml`: the generated variants the catalog gates.
- `CHANGELOG.md`: version history.

## Commands

`bun run dev` rebuilds on change and serves the host page on the package's port; `bun run check`
runs every gate (typecheck, lint, format, unit tests, build, size budget, API report, tarball lint,
consumers); `bun run build:e2e` builds the fixture module's four files; `bun run test:e2e`
builds them, then runs the browser suite against the API package and two host servers: Chromium,
Firefox and WebKit for every spec but one, and the screens spec in `phone` (WebKit) and `desktop`
(Chromium), which writes a screenshot of each screen to `test-results/screens/`;
`bun run api:types` regenerates `src/contract/` from the server's contract, keeping only
`/api/sdk/`.
