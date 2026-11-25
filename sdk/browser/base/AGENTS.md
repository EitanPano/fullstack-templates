# Agent Instructions: **PROJECT_NAME**-sdk

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
(`eslint.config.mjs`, held by `tests/unit/eslint-boundaries.test.ts`) refuses, with a message that
names the layer to use:

- the host half (`core`, `transport`, `ui`, `entries/index`, `entries/cdn`, a module's `host.ts`)
  imports `frame/`;
- the frame half (`frame`, `entries/frame`, a module's `frame.ts`) imports `ui/`, `transport/`
  or `core/`, or a host half;
- a module imports another module (they meet through the registry and the event bus);
- a layer below `entries/` imports `entries/` or `modules/`; `transport/`, `ui/` and `protocol/`
  import their upper neighbours; `protocol/` imports anything but `contract/`;
- `fetch`, `XMLHttpRequest` or `sendBeacon` outside `transport/` and `frame/sender.ts`;
- `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`.

Text from the server or the host reaches the DOM as a text node (`appendText`, `textContent`),
and a link is https (`createLink`). The frame's policy has no `style-src`: a frame module sets
styles through `el.style`, never a `style` attribute or a stylesheet.

## Adding a feature

A feature is a module: `src/modules/<name>/`, named for its glossary term, with files flat in
the folder.

1. `host.ts` exports a `HostModule`: `start(context)` runs on the host page after the kill switch
   said `enabled`, draws through the `Renderer` of `ui/`, and returns its cleanup. It sends
   events with `context.emit` and telemetry with `context.track`.
2. `frame.ts` exports a `FrameModule`: `start(context)` runs in the frame after the handshake and
   draws into `context.mount`. It reports `rendered`, `clicked` or `error` with `context.report`
   (never `viewed`: the meter alone says a unit was seen) and talks to its host half through
   `context.send` and `context.onMessage`.
3. The two halves meet through `module` messages named for the module. Check every payload in
   the half that receives it: the other side is untrusted. A shared type goes in `types.ts`
   (it imports `protocol/` and `contract/` only).
4. Register it: add the host half to `modules` in `entries/index.ts` and `entries/cdn.ts`
   (`createSdk`, `bootCdn`) and the frame half to `modules` in `entries/frame.ts` (`runFrame`).
   The kernel is not edited; `tests/e2e/fixture-module/` is the working example.
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
  `clicked`, `error`. Each is a report after the fact, never what the server counts.
- The surface is a contract: `etc/sdk.api.txt` is committed and `check` fails when the
  built `.d.ts` differs. A removal or a change is a major; the CDN files live under
  `v<major>/` of this package's own version.

## Errors

Every entry point runs in the error boundary (`core/sdk.ts`): no public call throws into the host,
a throwing handler or module is caught, and what went wrong reaches the host as an `error` event
with a short message, never a stack. `enabled: false`, a failed read and a slow read of
`GET /api/sdk/v1/config` leave the page untouched, with no frame created. A frame that does not
answer the handshake collapses its container and reports nothing: `load` and `error` of the
iframe are never read as signals. Inside the frame a module's failure goes out as an `error`
report.

## Tests

`bun run test` runs `tests/unit/` on jsdom (Vitest): one happy path and one failure for each
behaviour. `eslint-boundaries.test.ts` lints one violation and one allowed case per rule through
the real config. `tests/e2e/fixture-module/` holds a feature for tests only; `build:e2e` writes
its build, and the e2e suite of the project serves that folder from the API and loads it into a
host page on another site, under a strict policy (`default-src 'none'; script-src 'self' <file
origin>; connect-src <API origin>; frame-src <API origin>`). It asserts no policy violation, no
uncaught error, one new property on `window`, a handshake from a listed origin, a collapse from
an unlisted one, a frame the page cannot read, and no `viewed` for each way of hiding the frame.
`tests/consumers/` are the three files `consumers` runs against the tarball. A test is never
deleted, skipped or focused to get a gate green.

## Deployment

What the integrator adds to their policy, and nothing for styles:

- `script-src`, `connect-src` and `frame-src` gain the API's origin. The tag is
  `<script async src="<API>/api/sdk/dist/v<major>/loader.js" data-key="<key>"></script>`; an
  inline loader needs a nonce or a hash, and under Trusted Types a loader may not assign a string
  to `script.src`.
- The unit's element stays where it is through a re-render: a moved iframe reloads.
- The browser logs a blocked or refused request in the console; the SDK cannot hide that line.

Release steps: bump `version` and `CHANGELOG.md`; `bun run check`; for a change under
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
  `POST /api/sdk/v1/telemetry` (`{ events: [...] }`), which the server's product adds.
