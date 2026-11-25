# Agent Instructions: `__PROJECT_NAME__-sdk`

An embeddable browser SDK. Other sites load it from a `<script>` tag or install it from npm. A page
mounts a unit of a module; the unit is drawn in an iframe from the API's origin, and the page is
told what happened to it. It is a library on pages we do not control, so it never breaks, slows or
restyles its host. A feature is a `module`; one mounted instance of it on a page is a `unit`. The
rules for the whole project are in the root `AGENTS.md`; this file holds this package's own.

## Stack

TypeScript 6.0.3, tsdown 0.23.7, Vitest 5 on jsdom, ESLint 9 (flat config), Prettier. No runtime
dependency. `bun run check` runs every gate and stops at the first failure.

| Command                                     | Meaning                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `dev`                                       | Rebuilds on change and serves a host page (`playground/`) on this package's port; it loads the loader the API serves.                |
| `build`                                     | `dist/`: the npm entry (ESM, CJS, types) and `dist/cdn/v<major>/` (`loader.js`, `frame.js`, `frame.css`, `frame.html`).              |
| `build:e2e`                                 | The same four files with the fixture module registered, in `tests/e2e/.build/cdn/v<major>/`.                                         |
| `test:e2e`                                  | `build:e2e`, then Playwright against the API and two host servers it starts: three engines and the screens. `check` does not run it. |
| `api:types`                                 | Regenerates `src/contract/` from the server's OpenAPI document. Run it after a change under `/api/sdk/`.                             |
| `typecheck`, `lint`, `format:check`, `test` | One gate each; `format` rewrites files.                                                                                              |
| `size`                                      | Fails over the byte budget of an output (`package.json › sdk.sizeBudget`).                                                           |
| `api`, `api:update`                         | Compares the public surface with `etc/sdk.api.txt`; `api:update` rewrites the report.                                                |
| `pack:lint`, `consumers`                    | `publint` and are-the-types-wrong on the tarball; ESM, CJS and no-`window` consumers installed from it.                              |

## Layers

```
src/
  entries/    index (npm), cdn (one global, drains the tag's queue), frame (the frame's script),
              host-modules, frame-modules (one list per half)
  core/       init, config, units (registry and life), slots, the event bus, the error boundary
  transport/  the one network door on the host side: timeout, retry
  contract/   types generated from the server's contract: committed, never edited
  protocol/   the messages between loader and frame, their guards, the request shape
  ui/         the iframe and its channel (frame.ts), the inline and modal containers
  frame/      inside the frame: handshake, size, sender, telemetry buffer, observeView, dom, base.css
  modules/    one feature each: host.ts, frame.ts, frame.css; none ships
tests/        unit, e2e (specs, host pages, fixture-module), consumers
```

Imports go `entries → modules → core | transport | contract | protocol | ui | frame`. The lint
(`eslint.config.mjs` with `eslint-plugin-boundaries`, held by
`tests/unit/eslint-boundaries.test.ts`) reads the file an import resolves to, so how a path is
spelled changes nothing. It refuses, with a message that names the layer to use:

- the host half (`core`, `transport`, `ui`, the host entries, a module's `host.ts`) imports `frame/`
  or a frame half;
- the frame half (`frame`, `entries/frame`, a module's `frame.ts`) imports `ui/`, `transport/`,
  `core/` or a host half;
- a host half is data: it imports the types of `core/` (`import type`), never kernel code;
- a module imports another module, by any path; a file both halves share imports a half;
- a layer below `entries/` imports `entries/` or `modules/`; `transport/`, `ui/` and `protocol/`
  import their upper neighbours; `protocol/` imports anything but `contract/`;
- the network outside `transport/` and `frame/sender.ts`: `fetch` called on any object,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `new Image`, and `sendBeacon` (this one everywhere);
- markup (`innerHTML`, `insertAdjacentHTML`, `write`, `parseFromString`, `DOMParser` and kin) and
  addresses: `setAttribute` of `href`, `src`, `srcset`, `srcdoc`, `style` or an `on…` name (or a
  name the lint cannot read), `setAttributeNS`, an assignment to a member named `href`, `src`,
  `srcset` or `srcdoc`, and `Object.assign` with one in its source. `frame/dom.ts` (links and
  images) and `ui/frame.ts` (the iframe's address) are the two places that set one. A computed key
  is not read: the frame's policy and the review hold the rest.

Text from the server or the host reaches the DOM as a text node (`appendText`, `textContent`), a
link is https (`createLink`) and an image comes through `createImage`.

The frame document's policy is the API package's: `framePolicy` in `src/middleware/sdk-files.ts`
(`server/bun-express`), `_frame_policy` in `src/app/middleware/sdk_files.py`
(`server/python-fastapi`), `framePolicy` in `server/middleware/sdk-files.ts` (`serverless/cloudflare`).

## Adding a feature

A feature is a module: `src/modules/<name>/`, named for its glossary term.

1. `host.ts` exports a `ModuleDeclaration`: `{ name, title, display?, placeholderHeight?, slot? }`.
   `display` is `'inline'` (default) or `'modal'`: `mount` takes one, `open` the other. `name` is lowercase letters, digits and `-` (40 at most), also the name of the frame half;
   `title` is the iframe's accessible title, never empty; `placeholderHeight` holds the space until
   the frame reports its own; `slot: { props }` lets a page mount it from markup (dataset names:
   `itemId` reads `data-item-id`). No code of the module runs on the host page.
2. `frame.ts` exports a `FrameModule`: `start(ctx)` runs in the frame after the handshake and draws
   into `ctx.mount`. It may return a promise: resolved is drawn (`rendered`), thrown or rejected is
   `module_failed`. `ctx.props()` and `ctx.onProps(handler)` give the page's props; `ctx.emit(name,
data?)` tells the page; `ctx.close()` asks to close; `ctx.track(item)` is telemetry (a plain
   JSON object), dropped before consent; `ctx.request(path, body?)` calls the API from the frame's own origin under
   `/api/sdk/`, for an entity behind `frameOnly`, with no consent wait; it resolves with the parsed
   JSON and rejects with `bad_path`, `timeout`, `network` or `status_<number>`, never server text.
   The frame is removed with its unit: nothing runs after `start`. `observeView(target, { ratio,
dwellMs, onView })` says an element was in view; the module sends its own event.
3. `frame.css` (or `frame/**/*.css`) is its sheet; see Styling.
4. Register it: the declaration in `hostModules` (`entries/host-modules.ts`), the frame half in
   `frameModules` (`entries/frame-modules.ts`); both reach the e2e build. The kernel is not
   edited; `tests/e2e/fixture-module/` is the working example.
5. Add each state of the unit (filled, empty, error) to `tests/e2e/unit-screens.ts`.
6. Test both halves in `tests/unit/`, with a failure case for each behaviour, and the unit in
   `tests/e2e/`. Run `api:update` only if the public surface changed on purpose.
7. A new endpoint under `/api/sdk/v1/` changes the server's contract: run `api:types` after it.

What a module emits is seen by the host page. Nothing the server counts, no token and no server
text goes into `emit` or into a prop it echoes back. Check every prop in the frame half: the page
is untrusted. A change in a frame half asks for the security review.

## Public API

`init`, `mount`, `open`, `on`, `setConsent`, `setTheme`, `destroy`, `version` and their types, the same on
the npm entry and on the CDN global (`GLOBAL_NAME` in `src/entries/global-name.ts`).

- `init({ key, apiOrigin?, theme?, consent?, observe? })`: once; a second call is the same
  instance. The CDN loader defaults `apiOrigin` to its tag's origin; the npm build takes a default
  from `SDK_API_ORIGIN` at build time. With neither, `init` reports an `error`.
- `mount(module, target, props?)` returns a handle `{ id, module, update(props), close() }` and
  never throws: a refusal is an `error` event and an inert handle. Props are a plain JSON object of
  at most 8,192 bytes. A call made before the kill switch is read waits; on a no it reports
  `closed` with `disabled`. An instance holds 50 units, slots included; the 51st is `too_many_units`.
- `open(module, props?)` shows a modal module in a dialog and returns `mount`'s handle, with its
  cap, wait and refusals. A second modal is `modal_open`; the other display's call, `bad_display`.
- Events: `rendered` (once per unit); `closed` with `reason` `host`, `frame` (also a modal's Escape), `timeout`, `failed`, `disabled` or `slot_removed`; `error`
  with a fixed `code`, never text (`bad_options`, `bad_key`, `no_api_origin`, `bad_api_origin`,
  `config_failed`, `global_taken`, `not_initialised`, `unknown_module`, `bad_slot`, `bad_display`,
  `modal_open`, `bad_target`, `bad_props`, `props_too_large`, `too_many_units`, `module_failed`, `internal`); and
  `<module>:<event>` with `data` (8,192 bytes at most). A unit's events name its `module` and
  `unit` and follow `mount`'s return, a refusal too; `bad_key`, `config_failed`, `global_taken`,
  `bad_slot` and `internal` name no unit.
- A slot is an element with the SDK's attribute (`SLOT_ATTRIBUTE` in `global-name.ts`) whose value
  is a module's name, mounted at `init` and again on `DOMContentLoaded` if the tag ran early. Only a
  module that declares `slot` is mounted, never a modal, and only the `data-` attributes
  `slot.props` lists become props; another stays on the page. A refused slot is `bad_slot`.
  `observe: true` (or `data-observe` on the tag) also mounts slots added later and closes the unit
  of one removed (`slot_removed`); without it the SDK adds no observer.
- The tag's queue (`window.<Global> = [...]`, filled before the file loads) runs its calls in
  order, then the tag's `data-key` init, then each function entry with the global. The CDN global
  alone has `push(...entries)`, which runs an entry the same way.
- A global the page owns under the SDK's name is left alone and reported as `global_taken`; a
  second tag does nothing.
- The protocol (`protocol/messages.ts`): `v` is fixed within a package major; an addition is an
  optional field or message type that a receiver may ignore.
- The surface is a contract: `etc/sdk.api.txt` is committed and `check` fails when the built
  `.d.ts` differs. A removal or a change is a major.

## Errors

Every entry point runs in the error boundary (`core/sdk.ts`): no public call throws into the host,
a throwing handler is caught, and what went wrong reaches the host as an `error` code, never a
stack. `init` takes a key of letters, digits, `_`, `.` and `-` (128 at most). `enabled: false`, a
failed read and a slow read of `GET /api/sdk/v1/config` leave the page untouched, with no frame
created. A frame that does not load in 20 s, or answer the handshake in 4 s from its `load`, is
removed and reports `closed` with `timeout`; `error` of the iframe is never read. A module's failure goes out as `module_failed`,
never its message. Each side checks what it receives (props, event names, data, sizes). `destroy`
closes every unit and aborts a read and a module's `request` in flight; handlers stay
registered across `destroy` and a later `init`.

## Tests

- `bun run test` runs `tests/unit/` on jsdom: one happy path and one failure for each behaviour.
  `eslint-boundaries.test.ts` lints one violation and one allowed case per rule through the real
  config; `script-cli.test.ts` runs each gate file and checks its exit code both ways.
- `bun run test:e2e` runs `tests/e2e/*.spec.ts` in Chromium, Firefox and WebKit, because a guest
  behaves differently in each (ADR 0020 F4). `playwright.config.ts` starts, fresh each run, the API
  package (one made-up key for the listed host) and two host servers (`tests/e2e/host-server.mjs`):
  the listed host on `__PORT__`, an unlisted one on the next port, both on `127.0.0.1` while the API is
  on `localhost`. Their pages (`tests/e2e/pages/`) allow no inline script or style, and reach the
  API's origin only.
- The engine specs cover the guest (no violation, no error, one new property on `window`, no
  listener or observer unasked) and each feature of the package. Where an engine differs, the spec
  asserts what that engine does (`view.spec.ts` has the view helper's table), never a looser number.
- `screens.spec.ts` runs in two projects of its own, `phone` (WebKit, 390 by 844) and `desktop`
  (Chromium, 1280 by 800), not in the three engines. For each entry of `unit-screens.ts`, light and
  dark, it mounts the unit, writes `test-results/screens/<name>-<project>-<scheme>.png` and checks
  inside the frame: no axe violation of WCAG A and AA, no sideways scroll; a unit has no `h1`.
- One spec: `bun x playwright test tests/e2e/view.spec.ts --project=firefox`; install the engines
  with `bun x playwright install chromium firefox webkit` (Linux: `--with-deps`).
- `tests/consumers/` are run by `consumers` against the tarball. A test is never deleted, skipped
  or focused to get a gate green.
- Each gate is a file in `scripts/` with its logic in `scripts/lib/` for the tests. `api:types`
  refuses a server whose contract has no `/api/sdk/` path, and restores `src/contract/` if its
  output names a path outside it.

## Styling

- `frame.css` is `src/frame/base.css` followed by each module's sheet. The frame document links it
  under `style-src 'self'`; a `<style>` element and a `style` attribute stay refused.
- Use the tokens of `base.css`: `--sdk-text`, `--sdk-accent`, `--sdk-muted`, `--sdk-surface`,
  `--sdk-border`, `--sdk-radius`, `--sdk-font`, `--sdk-space`. The host's theme sets text, accent,
  radius and font on the root, so a rule that uses a token follows it. No hard-coded colour, no
  host font.
- Spacing is a multiple of 4 px; a target is at least 44 px high and wide.
- Scope every rule under the module's `data-module`: `[data-module='<name>'] .x`. The build fails,
  naming file and line, on a rule outside it, `@import`, `@font-face` or `url(`.
- Breakpoints follow the frame's width.
- The frame is transparent and its `color-scheme` follows the theme, so the page shows through. A
  unit that needs a contrast check paints its own surface (`--sdk-surface`): axe cannot see the
  page behind the frame.
- A modal frame's root has `data-display="modal"`: `base.css` gives the scrim (`--sdk-scrim`) and
  centres the mount, the module's sheet the panel. Focus goes to the first `[autofocus]`, else the
  mount: mark the first field `autofocus` and do not call `focus()` in `start` (WebKit ignores it).
  Draw your own close control: a touch screen has no Escape, and the scrim closes nothing.
- `el.style` is for a value known only at run time; a fixed one goes in the sheet.
- An image goes through `createImage(doc, src, alt)`, never a `url()`: https or the frame's own
  origin, `alt` required (empty for decoration). Another origin needs `SDK_IMG_ORIGINS` on the server, which the
  backend sets; the policy refuses an origin it does not list.

## Deployment

What the integrator adds to their policy:

- `script-src`, `connect-src` and `frame-src` gain the API's origin; nothing for styles or images.
  The tag is `<script async src="<API>/api/sdk/dist/v<major>/loader.js" data-key="<key>"></script>`;
  an inline loader needs a nonce or a hash, and under Trusted Types a loader may not assign a string
  to `script.src`. A page that cannot run script marks slots in its markup.
- The unit's element stays where it is through a re-render: a moved iframe reloads.
- A host can hide the dialog and collect clicks: check `observeView` before a modal action the
  server counts.
- The browser logs a blocked or refused request in the console; the SDK cannot hide that line.

Release steps: bump `version` and `CHANGELOG.md` (the size budget's keys say `v{major}` and follow
the version; a new `.js` or `.css` output in `dist/cdn/v<major>/` needs a budget of its own); `bun
run check`; for a change under `transport/`, `entries/`, `protocol/` or `frame/`, ask for the
security review; publish to npm (provenance on) and deploy the API package, which
serves `dist/cdn`.

Old builds: the API package holds one build, so a new major breaks the loaders still installed.
Before the first major bump, keep each released `dist/cdn/v<major>/` in a store the API serves by
major, with a fixed-version address and an integrity hash for hosts that want one.

A write from the frame goes to an entity behind the server's frame-only guard (`frameOnly`,
`frame_only` in Python), which answers only a same-origin request with the key; an entity mounted
without it is readable by the host page. What the server counts is decided on the server.
