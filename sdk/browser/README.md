# sdk/browser

An embeddable browser SDK ([ADR 0020](../../docs/adr/0020-sdk-kind.md)): other sites load it from a
`<script>` tag or install it from npm. It reads a kill switch from the server's `/api/sdk/v1/config`,
draws units in a sandboxed iframe from the API's origin and reports `rendered`, `viewed`, `clicked`
and `error` to the host page. No runtime dependency; no module ships (a feature is added with the
recipe in the package's `AGENTS.md › Adding a feature`). A module's frame half calls an entity the
server mounts behind `frameOnly` with `context.request`, and sends telemetry with `context.track`;
the lint refuses `href`, `src` and `srcdoc` set by `setAttribute` or by assignment.

Generated with `--sdk <dir>=sdk/browser` beside any stack's API package; the harness names the
directory `sdk-<name>`. The package is not a frontend: no static build, no brand, no screens. Its
playground port is 5190 and the global its CDN loader sets is the directory's last segment in
PascalCase with `sdk-` dropped (`sdk-ads` gives `Ads`).

## Layout

- `template.yaml`: the manifest (commands, contract, playground port, `cdn.out`).
- `base/`: the files copied into the package: `src/` (`entries`, `core`, `transport`, `contract`,
  `protocol`, `ui`, `frame`, `modules`), `tests/` (unit, e2e specs and host pages, consumers, a fixture module), `scripts/`
  (size, API report, pack lint, consumers, playground), `playground/`, `Dockerfile`, `bun.lock`,
  the committed `src/contract/` and `etc/sdk.api.txt`.
- `base/Dockerfile`: the `dist` target holds `dist/cdn` at `/sdk` for the server's image: one folder
  per major, `v<major>/loader.js`, `frame.js` and `frame.html`, which the API package serves under
  `/api/sdk/`.
- `compose.yaml`: a build-only service (the server's `additional_contexts` reads it).
- `tests/cases.yaml`: the generated variants the catalog gates.
- `CHANGELOG.md`: version history.

## Commands

`bun run dev` rebuilds on change and serves the host page on the package's port; `bun run check`
runs every gate (typecheck, lint, format, unit tests, build, size budget, API report, tarball lint,
consumers); `bun run build:e2e` builds the fixture module's three files; `bun run test:e2e`
builds them, then runs the browser suite in Chromium, Firefox and WebKit against the API
package and two host servers; `bun run api:types`
regenerates `src/contract/` from the server's contract, keeping only `/api/sdk/`.
