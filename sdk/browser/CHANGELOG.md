# Changelog

## 1.0.0 — 2026-11-25

First release ([ADR 0020](../../docs/adr/0020-sdk-kind.md), changed in place by
[ADR 0021](../../docs/adr/0021-sdk-units.md): nothing here was released before). The kernel (`init`,
`mount`, `open`, `on`, `setConsent`, `setTheme`, `destroy`, `version`; error boundary, event bus, unit
registry, consent, kill switch), the transport, the protocol, the iframe and its channel, and the
frame (handshake, size, stylesheet, images, telemetry, view helper), three outputs from one source,
and the gates `size`, `api`, `pack:lint` and `consumers`.

A module is a declaration on the host page (`name`, `title`, `slot`, `display`,
`placeholderHeight`) and a frame half. A page mounts a unit with `mount`, opens a modal one with `open`, or marks an element for it
(a slot); each event names its module and unit, and a module's own events reach the page as
`<module>:<event>`.

`test:e2e` (the manifest's `testE2e`) runs the SDK in Chromium, Firefox and WebKit on host pages
under a strict policy, against the API package, and a screens spec that writes a screenshot of each
screen and scans it with axe (`phone` and `desktop`). `src/contract/` is the output of the
server's contract (the config and telemetry operations), and the `contract` step refuses a server
without the SDK namespace.

Also in 1.0.0:

- A module declares `display: 'modal'` and is shown by `open(module, props?)` in a `<dialog>` the
  kernel makes in a closed shadow root: above the page, the page inert and its scroll locked, focus
  moved into the frame and back to the opener, Escape closing it; one at a time (`modal_open`), and
  the display is the module's (`bad_display`). There is no `destroy` message and a module's `start`
  returns no cleanup: a closed unit's frame ends with its iframe.

- Lint on `eslint-plugin-boundaries` (the resolved file, not the import's text) and a ban on
  network doors and DOM sinks reached through any object; the gates are files that always run.
- A frame serves the one module its address names; a module's failure reaches the host as
  `module_failed`, never its message; a frame that never answers is removed and reported as
  `closed` with `timeout`.
- A module's frame half has `ctx.request(path, body?)`, a call to the API from the frame's own
  origin under `/api/sdk/` (the way to an entity behind `frameOnly`; no consent wait; errors
  `bad_path`, `timeout`, `network`, `status_<n>`); `track` is telemetry only, buffered in the frame
  and sent to `POST /api/sdk/v1/telemetry` on page hide, which a closed unit's frame gets as it
  leaves the page. The flush drops an item JSON cannot hold and measures the cap in UTF-8 bytes.
- The view helper `observeView` is a tool of a module's frame half, with its answer per engine
  asserted by `view.spec.ts`.
- The CDN loader leaves a page's own global alone and a second tag does nothing; the iframe is put
  in the page with its address already set (WebKit fired `load` for an empty document first); the
  iframe's `title` and `module` come from the module; one key pattern, the servers'.
- A slot added later is mounted and a removed one closes only with `observe`; an element removed
  and added again is mounted again, and one whose unit failed is not.
- `accessibility.spec.ts` scans a page with the drawn frame with axe, in the three engines. The
  headings of `AGENTS.md` and `README.md` name the package in a code span, so the formatter leaves
  the placeholder alone.
- Size budget keys say `v{major}`; packaging ignores come from `shared/gitignore/sdk.gitignore`.
