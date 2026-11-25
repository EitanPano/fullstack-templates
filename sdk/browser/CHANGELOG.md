# Changelog

## 1.0.0 — 2026-11-25

First release ([ADR 0020](../../docs/adr/0020-sdk-kind.md)). The kernel (`init`, `destroy`, `on`,
`setConsent`, `version`; error boundary, event bus, module registry, consent, kill switch), the
transport, the protocol, the frame renderer and the frame (handshake, size, visibility meter),
three outputs from one source, and the gates `size`, `api`, `pack:lint` and `consumers`.

`test:e2e` (the manifest's `testE2e`) runs the SDK in Chromium, Firefox and WebKit on host pages
under a strict policy, against the API package. `src/contract/` is the output of the server's
contract, and the `contract` step refuses a server without the SDK namespace.

Also in 1.0.0:

- Lint on `eslint-plugin-boundaries` (the resolved file, not the import's text) and a ban on
  network doors and DOM sinks reached through any object; the gates are files that always run.
- A frame serves the one module its address names; the meter starts when that module has
  rendered, and the module learns of a view with `onView`; a module's failure reaches the host as
  `module_failed` and its name, never its message. Modules meet on `ctx.bus`.
- A module's frame half has `context.request(path, body?)`, a call to the API from the frame's
  own origin under `/api/sdk/` (the way to an entity behind `frameOnly`; no consent wait; errors
  `bad_path`, `timeout`, `network`, `status_<n>`; the e2e makes the call in the three engines);
  `track` is telemetry only. The telemetry flush
  drops an item JSON cannot hold, measures the cap in UTF-8 bytes and never throws into the page;
  a frame with no module in its address reports `module_failed`; the lint also refuses assigning
  `href`, `src` or `srcdoc`.
- The CDN loader leaves a page's own global alone and a second tag does nothing; the iframe is put
  in the page with its address already set (WebKit fired `load` for an empty document first); the
  iframe's `title` and `module` come from the module; one key pattern, the servers'.
- `accessibility.spec.ts` scans a page with the drawn frame with axe (no serious or critical
  violation), in the three engines. The headings of `AGENTS.md` and `README.md` name the
  package in a code span, so the formatter leaves the placeholder alone.
- Size budget keys say `v{major}`; packaging ignores come from `shared/gitignore/sdk.gitignore`.
