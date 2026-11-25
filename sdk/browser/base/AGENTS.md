# Agent Instructions: `__PROJECT_NAME__-sdk`

An embeddable browser SDK. Other sites load it from a `<script>` tag or install it from npm; it
asks the API for content, draws it in an iframe from the API's origin and reports what
happened to it. It is a library on pages we do not control, so it never breaks, slows or
restyles its host. The rules for the whole project are in the root `AGENTS.md`; this file holds
this package's own.

## Stack

TypeScript 6.0.3 (one version for the bundler's declarations, the contract tool and
api-extractor), tsdown 0.23.7, Vitest 5 on jsdom, ESLint 9 (flat config), Prettier. No runtime
dependency. Commands: `bun run check` runs every gate and stops at the first failure.

| Command                                     | Meaning                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`                                       | Rebuilds on change and serves a host page (`playground/`) on this package's port; it loads the loader the API serves.                                     |
| `build`                                     | `dist/`: the npm entry (ESM, CJS, `.d.ts`, `.d.cts`) and `dist/cdn/v<major>/` (`loader.js`, `frame.js`, `frame.html`). The API package serves `dist/cdn`. |
| `build:e2e`                                 | The same three files with the fixture module registered, in `tests/e2e/.build/cdn/v<major>/`.                                                             |
| `test:e2e`                                  | `build:e2e`, then Playwright in Chromium, Firefox and WebKit against the API and two host servers it starts. `check` does not run it.                     |
| `api:types`                                 | Regenerates `src/contract/` from the server's OpenAPI document. Run it after a change under `/api/sdk/`.                                                  |
| `typecheck`, `lint`, `format:check`, `test` | One gate each; `format` rewrites files.                                                                                                                   |
| `size`                                      | Fails over the byte budget of an output (`package.json › sdk.sizeBudget`).                                                                                |
| `api`, `api:update`                         | Compares the public surface with `etc/sdk.api.txt`; `api:update` rewrites the report.                                                                     |
| `pack:lint`, `consumers`                    | `publint` and are-the-types-wrong on the tarball; ESM, CJS and no-`window` consumers installed from it.                                                   |

## Layers

```
src/
  entries/    index (npm), cdn (one global, drains the tag's queue), frame (the frame's script)
  core/       init, config, the module registry, the event bus, the error boundary, consent
  transport/  the one network door on the host side: timeout, retry, the telemetry buffer
  contract/   types generated from the server's contract: committed, never edited
  protocol/   the messages between loader and frame, their guards, the request shape
  ui/         the renderer interface; the frame renderer's host half
  frame/      what runs inside the frame: handshake, size, visibility meter, mount, sender
  modules/    one feature each, a host half and a frame half; none ships
tests/        unit, e2e/fixture-module, consumers
```

Imports go `entries → modules → core | transport | contract | protocol | ui | frame`. The lint
(`eslint.config.mjs` with `eslint-plugin-boundaries`, held by
`tests/unit/eslint-boundaries.test.ts`) reads the file an import resolves to, so how a path is
spelled changes nothing. It refuses, with a message that names the layer to use:

- the host half (`core`, `transport`, `ui`, `entries/index`, `entries/cdn`, a module's `host.ts` or
  `host/`) imports `frame/` or a module's frame half;
- the frame half (`frame`, `entries/frame`, a module's `frame.ts` or `frame/`) imports `ui/`,
  `transport/` or `core/`, or a host half; `entries/index` and `entries/cdn` register host halves,
  `entries/frame` registers frame halves;
- a module imports another module, by any path; a file both halves share (`types.ts`) imports a
  half. Modules meet through `ctx.bus`;
- a layer below `entries/` imports `entries/` or `modules/`; `transport/`, `ui/` and `protocol/`
  import their upper neighbours; `protocol/` imports anything but `contract/`;
- the network outside `transport/` and `frame/sender.ts`: `fetch` called on any object,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `new Image`, and `sendBeacon` (this one everywhere);
- markup and addresses: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `write`, `writeln`, `srcdoc`,
  `setHTMLUnsafe`, `createContextualFragment`, `DOMParser`, `setAttribute` of `href`, `src`,
  `srcdoc`, `style` or an `on…` name (or a name the lint cannot read), and an assignment to a member
  named `href`, `src` or `srcdoc` (`a.href = x`; `port.onmessage = …` is fine). `frame/dom.ts`
  (links, https only) and `ui/frame-renderer.ts` (the iframe's address) are the two places that set one.

Text from the server or the host reaches the DOM as a text node (`appendText`, `textContent`),
and a link is https (`createLink`). A frame module sets styles through `el.style`, never a `style`
attribute or a stylesheet.

The frame document's own policy is the API package's, not this package's: `default-src 'none'`
also blocks images, fonts and media, and there is no `style-src`. It is `FRAME_POLICY` in the API
package's SDK files middleware (`middleware/sdk-files.ts` in `server/bun-express`,
`middleware/sdk_files.py` in `server/python-fastapi`; `serverless/cloudflare` sets it in
`scripts/lib/csp-headers.mjs`; each API package's `AGENTS.md` names it). A unit that draws an image
adds `img-src` there, in the same change, and the e2e host page's policy follows.

## Adding a feature

A feature is a module: `src/modules/<name>/`, named for its glossary term. `host.ts` (or a `host/`
folder) is its host half, `frame.ts` (or `frame/`) its frame half, any other file is shared.

1. `host.ts` exports a `HostModule`: `start(context)` runs on the host page after the kill switch
   said `enabled`, draws through the `Renderer` of `ui/`, and returns its cleanup. The renderer
   needs the module's `module` (its name, lowercase, also the name of its frame half) and a
   non-empty `title` for the iframe: the kernel holds no wording of its own. It sends events with
   `context.emit`, telemetry with `context.track`, and talks to other modules on `context.bus`
   (`emit(topic, data)`, `on(topic, handler)`; it ends with `destroy`).
2. `frame.ts` exports a `FrameModule`: `start(context)` runs in the frame after the handshake and
   draws into `context.mount`. The frame's address names the module, and only that one starts.
   It reports `rendered` (the meter starts then, on what is drawn), `clicked` or `error` with
   `context.report`; the host sees a fixed code for an error (`module_failed`), never text, and a
   throw in `start` is reported the same way; so is a frame whose address names no module. It
   learns about a view with `context.onView` (it never reports `viewed`: the meter alone says a
   unit was seen) and talks to its host half through `context.send` and `context.onMessage`.
   `context.track` is telemetry: buffered, dropped before consent, sent when the page is hidden,
   to one fixed path. `context.request(path, body?)` is a call to the API from the frame's own
   origin, for an entity the server mounts behind `frameOnly` (the token, the proof of a view, a
   click); it does not wait for consent and `path` must stay under `/api/sdk/`. It resolves with
   the parsed JSON (`undefined` for a 204 or an empty body) and rejects with an `Error` whose
   message is `bad_path`, `timeout`, `network` or `status_<number>`, never server text.
3. The two halves meet through `module` messages named for the module. Check every payload in
   the half that receives it: the other side is untrusted. A shared type goes in `types.ts`
   (it imports `protocol/` and `contract/` only).
4. Register it: add the host half to `modules` in `entries/index.ts` and `entries/cdn.ts`
   (`createSdk`, `bootCdn`) and the frame half to `modules` in `entries/frame.ts` (`runFrame`);
   the lint accepts each of those imports and no other. The kernel is not edited;
   `tests/e2e/fixture-module/` is the working example.
5. Test both halves in `tests/unit/`, with a failure case for each behaviour. Run `api:update`
   only if the public surface changed on purpose.
6. A new endpoint under `/api/sdk/v1/` changes the server's contract: run `api:types` after it.
   `protocol/` and the namespace only add within a major.

## Public API

`init(options)`, `destroy()`, `on(event, handler)` (returns the unsubscribe), `setConsent(state)`,
`version`, and the types they need. The CDN global (`GLOBAL_NAME` in `src/entries/global-name.ts`)
and the npm entry expose the same surface; the CDN loader also starts itself from the `data-key`
of its tag and drains a queue (`window.<Global> = [['init', {...}]]`) an inline stub filled.

- `init({ key, apiOrigin?, theme?, consent? })`: once; a second call is the same instance. The CDN
  loader defaults `apiOrigin` to the origin of its own tag; the npm build takes a default from the
  environment variable `SDK_API_ORIGIN` at build time. With neither, `init` does nothing and
  reports an `error` event.
- Events the host may see: `rendered`, `viewed` (with `occlusion: 'checked' | 'unavailable'`),
  `clicked`, `error` (a short text, or a module's failure as `message: 'module_failed'` with its
  `module`). Each is a report after the fact, never what the server counts.
- The page owns its names. The CDN loader leaves a global that is not its own alone and reports it
  as an `error`; a second tag does nothing.
- The protocol's rule (`protocol/messages.ts`): `v` is the protocol's major, fixed within a
  package major. An addition is a new optional field or a new message type, which a receiver that
  does not know it ignores; nothing is removed or retyped before the next major.
- The surface is a contract: `etc/sdk.api.txt` is committed and `check` fails when the
  built `.d.ts` differs. A removal or a change is a major; the CDN files live under
  `v<major>/` of this package's own version.

## Errors

Every entry point runs in the error boundary (`core/sdk.ts`): no public call throws into the host,
a throwing handler or module is caught, and what went wrong reaches the host as an `error` event
with a short message, never a stack. `init` takes a key of letters, digits, `_`, `.` and `-` (128 at
most), the pattern the servers use. `enabled: false`, a failed read and a slow read of
`GET /api/sdk/v1/config` leave the page untouched, with no frame created. A frame that does not
answer the handshake collapses its container and reports nothing: `load` and `error` of the
iframe are never read as signals. Inside the frame a module's failure goes out as an `error`
report with a fixed code and the module's name, never its message: what a module holds (a
token) does not leave the frame. `destroy` aborts a read, and a module's `request`, in flight and clears the module bus and
the consent handlers; a stalled body counts against the timeout.

## Tests

`bun run test` runs `tests/unit/` on jsdom (Vitest): one happy path and one failure for each
behaviour. `eslint-boundaries.test.ts` lints one violation and one allowed case per rule through
the real config; `script-cli.test.ts` runs each gate file and checks its exit code both ways.
`tests/e2e/fixture-module/` holds a feature for tests only; `build:e2e` writes its build.

`bun run test:e2e` (the manifest's `testE2e`) runs `tests/e2e/*.spec.ts` in Chromium, Firefox and
WebKit, because a guest behaves differently in each (ADR 0020 F4). `playwright.config.ts` starts,
fresh each run, the API package (`SDK_KEYS` lists one made-up key for the listed host,
`SDK_DIR` is `tests/e2e/.build/cdn`, `RATE_LIMIT_SCALE=100`) and two host servers
(`tests/e2e/host-server.mjs`): the listed host on `__PORT__` and an unlisted one on the next
port, both on `127.0.0.1` while the API is on `localhost`, each serving `tests/e2e/pages/` under
`default-src 'none'; script-src 'self' <API origin>; connect-src <API origin>; frame-src <API
origin>` (the pages hold no inline script or style). The specs assert no policy violation, no
uncaught error, one new property on `window` (and no listener the SDK adds on the page while it is
idle: the telemetry listeners, `visibilitychange` and `pagehide`, exist only once something is
tracked), a second tag or a page's own global under the SDK's name left alone, the shipped
`dist/cdn/v<major>/loader.js` installing its global and reading the kill switch (`shipped.spec.ts`), a handshake from a listed origin, a collapse from an
unlisted one, a frame the page cannot read, the kill switch, consent before telemetry, and no
`viewed` for each way of hiding the frame. Where an engine cannot detect a way of hiding it, the
spec asserts that limit for that engine (`view.spec.ts`). One spec: `bun x playwright test
tests/e2e/view.spec.ts --project=firefox`; install the engines once with `bun x playwright
install chromium firefox webkit` (on Linux, add `--with-deps`).
`tests/consumers/` are the three files `consumers` runs against the tarball. A test is never
deleted, skipped or focused to get a gate green.

Each gate is a file in `scripts/` that always runs when executed, with its logic in
`scripts/lib/` for the tests. `bun run api:types` (`scripts/contract.mjs`) refuses a server whose contract has no `/api/sdk/` path, and restores `src/contract/` if its output names a path outside it.

## Deployment

What the integrator adds to their policy, and nothing for styles:

- `script-src`, `connect-src` and `frame-src` gain the API's origin. The tag is
  `<script async src="<API>/api/sdk/dist/v<major>/loader.js" data-key="<key>"></script>`; an
  inline loader needs a nonce or a hash, and under Trusted Types a loader may not assign a string
  to `script.src`.
- The unit's element stays where it is through a re-render: a moved iframe reloads.
- The browser logs a blocked or refused request in the console; the SDK cannot hide that line.

Release steps: bump `version` and `CHANGELOG.md` (the size budget's keys say `v{major}` and follow
the version; a new `.js` output in `dist/cdn/v<major>/` needs a budget of its own); `bun run
check`; for a change under
`transport/`, `entries/`, `protocol/` or `frame/`, ask for the security review; publish to npm
(`npm publish`, provenance on) and deploy the API package, which serves `dist/cdn`. The files
at one address change with every release and carry no integrity hash.

Two recipes the project does before its first major bump:

- Old builds. The API package holds one build, so a new major takes the old major's `frame.js`
  and `frame.html` away from loaders still installed. Keep each released `dist/cdn/v<major>/`
  in a store (an object bucket or a folder in the image) that the API serves by major, and
  offer a fixed-version address with an integrity hash for hosts that want one.
- What the server adds (a template ships no product entity): a one-time token issued with
  each unit and kept in the frame; a view accepted once, not before a minimum time after the
  serve, and only for a served unit; a click accepted only after its view, through a redirect the
  server counts; limits per key, address and network; a score per key for what no single
  request shows; payment that waits for it. The frame sends its telemetry to
  `POST /api/sdk/v1/telemetry` (`{ events: [...] }`), which the server's product adds. Every
  endpoint only the frame calls (issuing the token, accepting a view or a click, the frame's
  telemetry) is mounted with the API package's `frameOnly` guard (`frame_only` in Python), which
  answers only a same-origin request with the key. An entity mounted without it is readable by
  the host page, so nothing the host can call issues or accepts what counts.
