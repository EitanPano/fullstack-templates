# ADR 0020: An SDK kind, the embeddable browser SDK and the server's SDK namespace

Status: accepted, 2026-11-25, by the owner ("accepted"). The decisions marked ▲ are the
session's, accepted with this record; the others are the owner's rulings ("support
a new root-module type - SDK … `sdk-<sdkName>`"; "distributed both as a CDN `<script>` snippet
and an installable npm package (ESM/CJS)"; "consider modular architecture"; the namespace in
"all servers at once"; the file "under `/api/`"; "iframe first, then shadow-dom"). Catalog
release `v1.18.0`: a new template `sdk/browser` 1.0.0 and a minor of each server template.
Amended before that release by [ADR 0021](0021-sdk-units.md): a note dated 2026-11-25 that
names it stands under each decision it changes.

## Context

A template's kind is `server`, `serverless` or `frontend`, and the tools, the stacks and the
harness all key on it. A product now needs a fourth thing: a small library that other
companies' developers load into their own pages, to ask our API for content, show it there and
report what happened to it. The first product of that shape shows native, context-aware
sponsored units inside chat interfaces and web apps, and reports viewability and clicks. It
pays the page's owner for each.

Such a package is none of the three kinds:

- It is a library. It has a public surface with a version of its own, and no port, image or
  deploy mode in production.
- It is a guest. It runs on origins we do not control, beside code we have not read, often
  under a Content-Security-Policy written before it arrived. It must never break, slow or
  restyle its host.
- Its host may be its adversary. A page that is paid per view has a reason to report views
  that did not happen, and every line of script that runs in that page is the page's to patch.
- It calls the API from another origin. Frontend invariant 2 says the opposite of every
  frontend: one origin, CORS off, no API address compiled in.
- A build stays where it was installed. A page that loaded it two years ago still calls the
  API, so the API it calls can only grow.
- It is a supply-chain target: one bad release reaches every host page.

Two spikes ran for the harness's plan 033, in Chromium 159, Firefox 159 and Playwright's WebKit
27.2. S1 (2026-11-24): the toolchain, the contract tool, and a Shadow DOM mount under a strict
policy. S2 (2026-11-25): a frame from our origin on another site's page. A research report of
the same day compared what embedded products and ad networks do. Their results are cited where
they decide a rule.

## Decisions

### K1. The kind and its directory

`sdk` is a fourth template kind; the first template is `sdk/browser`. The generator accepts any
valid directory for it; the harness holds a new project to `sdk-<name>`, `<name>` a kebab-case
term of the product's glossary.

- ▲ One SDK in a plan. A second is refused, by the generator and by the harness, until a case
  has run two.
- ▲ An SDK is not a frontend. The rule that a `server` package takes one frontend does not count
  it, none of the ten frontend invariants binds it, and it has no brand case.

### K2. The request

`--sdk <dir>=<template>`, the one spelling in the generator, the bootstrap and the harness's
`scaffold`, modelled on `--frontend` ([ADR 0015](0015-several-frontends-by-directory.md) F1).

- ▲ It needs `--stack`: every stack has an API package, and an SDK without one has nothing to
  call. No stack lists an SDK under `packages:`; it always comes from the request.
- Provenance records the package like any other: its template, version, port and commands.

### K3. The `sdk` selection

▲ A reserved selection `sdk`, like `single`, is true when the plan holds an SDK. A manifest
cannot declare a flag of that name, and `validate` dry-runs it on and off wherever `server` is
true. The server templates put the whole of N1 to N5 behind it, so a project without an SDK has
no cross-origin surface and generates the tree it did before this release. This differs from
`api/admin/`, which always ships: an unused admin folder refuses every request, an unused
cross-origin gate is one more thing to get wrong.

The API package reads the SDK's directory and output through placeholders of its own, as it
reads a frontend's (`__FRONTEND_PATH__`); the SDK's output is named by a manifest key that is
not `static`, so no tool takes it for a frontend's build.

### K4. The contract

The SDK consumes the server's contract as a frontend does (`contract: { consumes }`), with two
differences:

- ▲ Types only. No generated client, no `zod` schemas: `transport/` is the one caller of `fetch`
  (T2, invariant 6), and a guest pays for every byte.
- ▲ Only the operations under `/api/sdk/`. The rest of the product's API never reaches a public
  bundle. `@hey-api/openapi-ts` does both in its own config
  (`parser.filters.operations.include`, the `@hey-api/typescript` plugin alone); S1 found no
  other schema in the output. A schema an SDK path refers to does ship, so an SDK endpoint's
  shapes are schemas of their own, never an entity's.

### R1. Where a unit is drawn

A unit is drawn in an iframe whose document comes from our origin. A Shadow DOM mount on the
host page is the second renderer, behind the same interface, and does not ship in 1.0.0.

- Why the frame is first. In the page, the code that decides "this was seen" and the token that
  proves "this was served" are the page's to read and to call. A page paid per view reports
  one with a few lines of script, on real visitors, and no bot list sees it. In a frame of
  another site the page can read neither: S2 found the frame's document, its globals and its
  requests closed to the page in all three engines, and a click the page synthesizes never
  reaches the frame.
- What the frame does not give. A frame the page hides still thinks it is seen in some cases
  (F4), and a browser driven by a program defeats either renderer. The server's own checks are
  needed with both, and belong to the product (N6).
- ▲ Why a second renderer is kept open. Two ad networks whose code the research read draw in
  the page, with no frame, and carry the trust on the server; a product that does not pay per
  view, or that vets each host, may prefer the page's own look. One interface in `ui/` keeps
  that an addition and not a rewrite.
- ▲ A small frame that only measures, beside a unit drawn in the page, is refused: the page can
  keep that frame in view and hide the unit. What is measured must be what is shown.
- 2026-11-25, after the branch's review: the interface in `ui/` covers where a unit is
  mounted, not who draws it. A module's drawing half is a `FrameModule`, which runs in `frame/`
  only and which the host side may not import. The second renderer therefore needs a drawing
  contract at the module level as well (one half a module writes once, run by either renderer);
  it is an addition, and it is decided with that renderer, not before.
- 2026-11-25, ADR 0021 U1: the interface in `ui/` is removed. No module used it, and by the
  note above it could not serve the second renderer.

### F1. Who may frame it

The frame document is served by N5 with `Content-Security-Policy: frame-ancestors` naming the
origins of the request's key, and nothing else may frame it, nested or not (S2). The browser
enforces it; no `X-Frame-Options` is sent.

- ▲ A refused frame fires `load` and throws nothing in every engine. The loader therefore opens
  a handshake and, when no answer comes within its timeout, collapses the container and
  reports nothing to the page. `load` and `error` are never read as signals.
- 2026-11-25, ADR 0021 U2: the timeout is no longer silent. The unit is removed and the page
  is told `closed` with the reason `timeout`.

### F2. The frame's limits

▲ `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, and
never a token that allows top navigation. Without the attribute a frame navigated its host
with no gesture (S2); with these four it cannot, keeps its origin for its own requests and for
exact-origin messages, and opens a link in a new tab. The frame document carries a strict
policy of its own (`default-src 'none'`, its script and its connections from its own origin).

- All of R1 holds only while the host page is on another origin than the API. A page on the
  API's own origin (the product's own frontend, in `single`) can read the frame and lift its
  sandbox; that is the HTML standard's rule, read and not run in S2. Such a page is ours, so
  nothing is lost, but a key never lists the API's origin for a host we pay.
- 2026-11-25, ADR 0021 U5 and U6: the sandbox gains `allow-forms` (without it two engines fire
  no `submit`), and the frame's policy gains `style-src 'self'` and `img-src`. Its `script-src`
  and `form-action` are unchanged.

### F3. The channel

▲ The loader and the frame talk over one `MessageChannel`, handed over with a message to the
exact origin of the frame; the frame answers to the exact origin of its parent.

- The messages are a contract with a version: a loader installed from npm two years ago meets
  a frame served today. Within a major the protocol only adds; the loader's major is in the
  frame's address, so each major has its own frame build.
- No secret crosses the channel. A page that replaces the loader holds the port, so a token or
  anything that proves a view stays in the frame and goes to the API from there.
- What does cross: the host's text for the unit (the context), the theme, the height, and
  events the host may show (`rendered`, `viewed`, `clicked`, `error`), each a report after the
  fact and never the thing the server counts.
- 2026-11-25, ADR 0021 U2: the fixed reports are replaced by `props` in and a module's own
  `emit` out; `viewed` and `clicked` are no longer the kernel's. "No secret crosses the
  channel" stands, now as the guide's rule and the review's.

### F4. What "seen" means inside the frame

▲ The frame decides visibility itself and says how it knows. The kernel's meter combines: the
IntersectionObserver ratio against the top page (half the pixels for a continuous second, the
display standard), `document.visibilityState`, the frame's own size, and, where the engine has
it, IntersectionObserver v2's `isVisible`.

S2, per hiding trick, on that rule:

| The page… | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| scrolls it away, moves it off screen, shrinks or clips it to a pixel | not counted | not counted | not counted |
| sets `display: none` | not counted | counted | not counted |
| sets `visibility: hidden`, any opacity, covers it, scales it, stacks a copy | not counted (`isVisible`) | counted | counted |
| clips it with `clip-path` | not counted | counted | counted |

- A view event therefore carries the checks that ran (`occlusion: checked | unavailable`), and
  the server decides what a view from an engine without the check is worth. The template ships
  the meter and the field; the weighing is the product's.
- Not tested: Safari itself, a mobile engine, a tab in the background, a partial opacity.
- 2026-11-25, the template's e2e (Playwright 1.65.0, Chromium, Firefox and WebKit): Firefox did not
  count `display: none`, where S2 had counted it. The suite asserts what it observes in each
  engine, so the spec says "not counted" there. The other rows matched the table.
- 2026-11-25, ADR 0021 U7: the kernel no longer runs the meter. The same rule is
  `observeView`, a helper a module's frame half calls; the e2e still enforces the table,
  through a fixture.

### F5. Size and look

▲ The frame reports the height of its `html` element from a `ResizeObserver`; the loader sets
the iframe's height through the CSSOM (a `style` attribute would need the host's policy to
change). `html` and `body` have no margin. The loader holds a placeholder of the unit's
expected height, so nothing below it jumps.

- The theme (text and accent colour, radius, font stack, light or dark) travels in the frame's
  address, so the first paint is right, and again over the channel when the host changes it.
- The frame declares the host's `color-scheme` explicitly. Declaring none paints white on a
  dark page; `light dark` is opaque in two engines under a light system setting (S2).
- A font the host loaded is not the frame's: the stack names system faces, or the product
  serves its own.
- A moved iframe reloads its document (S2). The guide tells an integrator to keep the unit's
  element stable through a re-render; the loader survives a reload by a new handshake.

### N1. The namespace, in every server template

Every endpoint an SDK calls is under `/api/sdk/v1/` and lives in `api/sdk/<entity>/`, an entity
like any other. The namespace's `routes` mounts at `/api/sdk/v1` and applies one gate first
(N2). The three templates ship it in the same release. The loader calls it from the host's
origin; the frame calls it from ours.

- ▲ Within `v1` the namespace only adds: a new endpoint, a new optional request field, a new
  response field. Removing or changing one is a `v2` beside it, and `v1` stays while a build
  that calls it is in use.
- The error envelope, the request id and the log line are the server's own, unchanged.

### N2. The gate

▲ The same in every environment, in this order:

1. CORS for this namespace alone: the request's origin echoed when the key lists it, `Vary:
   Origin`, never `Access-Control-Allow-Credentials`, the key header and `content-type` allowed,
   and `Access-Control-Max-Age` of at least 600. S1 counted one preflight for repeated calls
   with it and one every five seconds without. A request from our own origin (the frame) needs
   none of it. The existing `CORS_ORIGINS` path is untouched.
2. A publishable key in a request header, resolved to the origins it may be used from. It
   identifies an integration; it is not a secret, and nothing is granted by it alone.
3. A rate limit by key and `by_ip`, a new subject on the template's existing limiter.

The default resolver reads `SDK_KEYS` (`key=origin,origin` pairs) through the env module; unset,
every request answers 403. A product replaces the resolver with a lookup once it has an entity
for keys. No cookie is read in the namespace: S1 saw one browser build send a cookie despite
`credentials: 'omit'`.

2026-11-25, after the branch's security review, built in the three templates:

- The global `CORS_ORIGINS` layer skips every path under `/api/sdk/`: left alone it answered the
  namespace's preflights and added `Access-Control-Allow-Credentials`. Step 1's last sentence
  is replaced by this.
- Step 3 runs by address first, then by key, and a preflight is counted on the address: one
  address cannot use up an integration's limit.
- Every answer of the namespace is `Cache-Control: no-store` and varies on `Origin` and the key
  header.
- Same-origin has one strict rule: `Sec-Fetch-Site` decides when the request carries it; without
  it, no `Origin` or one whose host is the request's own. A host that proxies the API through
  its own origin, or a client that is not a browser, can still look same-origin: N6 stands.
- A `frameOnly` guard narrows an entity to the frame: R1 and F3 need a part of the namespace the
  host page cannot call (the token, the view, the click, the frame's telemetry). None ships.
  It covers the entity's path and every path under it; the Worker's mount spells that out
  (`/<name>/*`), and each template tests a path under a guarded entity.
- A module's frame half reaches such an entity through `request`, a call of the frame's one
  network door to its own origin and the namespace only. It is not telemetry and does not wait
  for consent; its only error text is a fixed code.
- In production an `SDK_KEYS` origin that is `http:` or loopback is refused.
- The SDK's one global takes the suffix `Sdk` (`sdk-ads` gives `AdsSdk`), is never written over
  a value a host already holds, and a second tag does nothing.

2026-11-25, ADR 0021 U9: the resolver is asynchronous and answers a record, `{ origins,
enabled }`, and a body under the namespace is at most 64 KB.

### N3. The one endpoint that ships

▲ `GET /api/sdk/v1/config` answers `{ enabled: boolean }`: the kill switch. A script on other
people's pages needs a way to be turned off from the server, so this is the template's own
behaviour and not an example, and it is what the template's e2e exercises. No other SDK entity
ships; a product's units, events and keys are its own.

2026-11-25, ADR 0021 U8 and U9: a second entity ships, `POST /api/sdk/v1/telemetry`, behind
the frame-only guard, and `config` answers `false` for a key switched off.

### N4. The served files

The API package serves the SDK's CDN build at `/api/sdk/dist/v<major>/<file>`, `<major>` the SDK
package's own major, independent of the namespace's `v1`: the loader, and the frame's script.

- Under `/api/` by the owner's ruling. The first design had `/sdk/v<major>/`; S1 found it
  unreachable in `split` (the server listens on loopback, each frontend's nginx would need a
  proxy block, Next its own) and behind the Worker's host router. Every proxy already forwards
  `/api/`. These are the paths under `/api/` that are not JSON, and they are not in the OpenAPI
  document.
- ▲ Outside the gate of N2: a script tag sends no header. Each answers GET and HEAD with a short
  cache, `Cross-Origin-Resource-Policy: cross-origin` (over the server's own default),
  `Access-Control-Allow-Origin: *` and `X-Content-Type-Options: nosniff`; a missing file
  answers the error envelope, never a frontend's page.
- ▲ The Compose servers take the build as `single` takes a frontend's: the SDK ships a `dist`
  build target and a Compose service that is only a build context, the server an
  `additional_contexts` line, in both deploy modes. Compose 2.35.0 is therefore the floor for
  `split` too, in a project with an SDK. The Worker takes the build in `assemble` and the route
  fetches it through `ASSETS`.
- ▲ One address moves with every release, so it cannot carry an integrity hash, and the server
  holds one build, so a new major takes the old major's frame away from loaders still
  installed. A store that keeps old builds answers both; the package's guide carries the recipe
  and a project does it before its first major.
- 2026-11-25, ADR 0021 U6: the route serves the frame's stylesheet too, as `text/css`.

### N5. The frame document

▲ `GET /api/sdk/frame/v<major>?k=<key>` answers the frame's HTML, built by the SDK package,
with the `frame-ancestors` of F1 computed from the key and the policy of F2. An unknown key
answers `frame-ancestors 'none'`. It is the one HTML page the API package serves; like N4 it is
outside the OpenAPI document and behind the `sdk` selection.

2026-11-25, ADR 0021 U6 and U9: the policy gains `style-src 'self'` and `img-src`, the answer
carries `Referrer-Policy: no-referrer`, and a key switched off answers `frame-ancestors
'none'` as an unknown one does.

### N6. What the product adds on the server

Not shipped, named in the guide as the recipe, because a template ships no product entity: a
one-time token issued with each unit and kept in the frame; a view accepted once, not before a
minimum time after the serve, and only for a served unit; a click accepted only after its
view, through a redirect the server counts; limits per key, address and network; a score per
key for what no single request shows (every unit viewed, clicks at one point); and payment
that waits for it.

### T1. The template's layers

```
src/
  entries/   index (the npm entry), cdn (one global; drains the tag's queue), frame (the
             document's script inside the frame)
  core/      init, config, the module registry, the event bus, the error boundary, consent
  transport/ the one network door: timeout, retry, batching, the flush on page hide
  contract/  types generated from the contract, committed, never edited
  protocol/  the messages between the loader and the frame, with their version
  ui/        the renderer interface, and the frame renderer's host half: the iframe, the
             handshake, the size, the theme
  frame/     what runs inside the frame: the handshake, the size report, the visibility
             meter, the mount a module's frame half draws into
  modules/<name>/   one feature each, with a host half and a frame half; none ships
tests/       unit, e2e (the host fixture), consumers (ESM, CJS, no DOM)
```

Imports go `entries → modules → core | transport | contract | protocol | ui | frame`. The host
half of the code never imports `frame/`, the frame half never imports `ui/` or `core/`'s host
parts, and both import `protocol/`. A module never imports another module: modules meet through
the registry and the bus, so one can become a chunk loaded on demand without a rewrite. The
lint holds the direction, with a boundaries test as in the frontends. The recipe for a module
is the guide's `Adding a feature`; a template ships no placeholder code
([ADR 0010](0010-no-chrome-no-example-screen.md)).

2026-11-25, ADR 0021 U1 and U8: `core/` holds the units and their slots in place of the
registry and the bus, `ui/` the iframe, the inline mount and the dialog, `transport/` the
kill-switch read alone, and a module's host half is a declaration. `docs/conventions.md` holds
the map as it is.

### T2. What every SDK template satisfies

▲ Numbered so the harness can cite them.

1. **Three outputs, one source.** The npm entry: ESM, CJS and types, `sideEffects: false`,
   importable where there is no `window`, where `init` does nothing. The CDN loader: one IIFE
   and one global. The frame's script and document. Gate: `publint` and are-the-types-wrong on
   the packed tarball, and three consumers (ESM, CJS, no DOM) installed from it.
2. **Good guest.** No runtime dependency. One global. No public call throws into the host:
   every entry point runs inside the error boundary. `init` twice is one instance. On the host
   page the SDK adds a container and an iframe, and no style, markup or listener beyond them.
   Gate: the e2e loads the built loader into a host fixture on another site than the API,
   served with `default-src 'none'; script-src 'self' <file origin>; connect-src <API origin>;
   frame-src <API origin>`, and asserts no policy violation, no uncaught error, no unhandled
   rejection and one new property on `window`.
3. **A frame only where it may be.** F1 and F2. Gate: the e2e frames the document from a listed
   origin (the handshake completes) and from an unlisted one (the container collapses, nothing
   is thrown), and asserts the page can read nothing of the frame.
4. **Seen is the frame's word.** F4. The meter runs in the frame, and nothing that proves a
   view crosses the channel. Gate: the e2e hides the frame each way of F4's first row and
   asserts no view; unit tests of the rule; the event names the checks that ran.
5. **Size budget.** A number per output in the package; `check` fails over it.
6. **One network door on each side.** Only `transport/` calls `fetch` on the host side and only
   the frame's sender inside it, each with a timeout, `credentials: 'omit'`, the key header and
   the default cache mode (`no-store` defeats the preflight cache). Gate: a lint zone.
7. **Untrusted strings.** Text from the server or from the host reaches the DOM as text nodes;
   a link is https. No `innerHTML`, `insertAdjacentHTML` or `document.write`, on either side.
   Gate: lint and unit tests.
8. **Consent first.** Nothing is sent as telemetry until the consent state allows it.
9. **Telemetry that arrives.** A buffer drained once, on `visibilitychange` to hidden and on
   `pagehide`, sent as JSON with `keepalive`; the frame sends its own. Never `sendBeacon` with a
   JSON body: it is credentialed and S1 saw it arrive nowhere.
10. **Kill switch.** `init` reads N3; `enabled: false`, a failed read and a slow read each
    leave the page untouched, with no frame created.
11. **The public surface is a contract**, and so is the channel. A committed API report; `check`
    fails when the surface and the report differ. The CDN global and the npm entry expose the
    same surface. `protocol/` only adds within a major (F3).
12. **The agents file.** The headings `Adding a feature`, `Public API`, `Errors`, `Tests` and
    `Deployment`: the harness's frontend agent, which writes the package, already reads
    `Adding a feature`, `Errors` and `Tests` by name, and a feature here is a module. The
    layer map and the import rules with the lint that enforces them; under `Deployment`, what
    an integrator adds to their policy, the release steps, the recipes of N4 and N6. No step
    tells a task to edit it ([ADR 0019](0019-package-docs.md)).

2026-11-25: ADR 0021 changes invariants 2, 3, 4, 8, 9, 10 and 12 (its table);
`docs/conventions.md` holds their text as it is.

### T3. The tools of `sdk/browser`

▲ From S1, each run on the toy package:

| Concern | Pick | Why |
| --- | --- | --- |
| Bundler | tsdown | One config writes ESM, CJS, both declaration files and the IIFE. tsup's README calls it unmaintained; Vite's library mode writes no declarations |
| Size budget | a script of about ten lines | No dependency; fails over the number |
| Package lint | `publint`, are-the-types-wrong | Both pass on the tarball, in seconds |
| API report | api-extractor | Fails on a changed export, rewrites the report on request, warns of a type the surface forgot to export |
| Consumers | a script: pack, install, run three files | Under a second |

`build` is a script of the package: an image and `assemble` call it to get `dist/`. One
TypeScript version serves the bundler's declarations, the contract tool and api-extractor; the
template pins the one all three run on, found when the template is built. No resize library:
the one in common use is GPL or paid for a distributed SDK, and the loop is a dozen lines.

### T4. What an integrator is told

In the package's README and its guide's `Deployment`:

- the tag is `<script async src>`; an inline loader needs a nonce or a hash in the host's
  policy, and under Trusted Types a loader may not assign a string to `script.src`;
- the host's policy gains our origin in `script-src`, `connect-src` and `frame-src`, and
  nothing for styles;
- the unit's element stays where it is through a re-render: a moved frame reloads;
- the browser logs a blocked or refused request in the console; the SDK cannot hide that line.

## Alternatives considered

- **A fifth frontend directory, `sdk-<name>` on a frontend template.** One pattern to change in
  the harness. Refused: the template would break most of the ten frontend invariants (one
  origin, the shell, the brand, the screens, `index.html` at the static root), and a `server`
  package refuses a second frontend.
- **The namespace always shipped, as `api/admin/` is.** Simpler templates. Refused in K3.
- **A generated runtime client in the SDK.** The frontends' way. Refused in K4: bytes on someone
  else's page, and a second caller of `fetch`.
- **The Shadow DOM mount first.** The first design, and what the research report advised for a
  small network at launch: the page's own look, a smaller policy change, proved under a strict
  policy by S1. Set second by the owner's ruling, for the reason in R1.
- **Data only, the host draws the unit.** What native advertising between vetted parties does.
  Refused for hosts that sign up by themselves and are paid per event: the measurement and the
  sponsored label would both be the host's promise.
- **`sandbox` without `allow-same-origin`.** The strictest frame. Refused by S2: the frame's
  origin becomes `null`, its own requests need CORS and exact-origin messages fail.
- **`sendBeacon` for telemetry.** The usual advice. Refused by S1: with a JSON body it is
  preflighted and credentialed and never arrived; with a text body it cannot carry the header.
- **The files at `/sdk/v<major>/`.** A cleaner address. Refused in N4.
- **A fixed-version address with an integrity hash now.** Refused for this release: the server
  holds one build. Named in N4 as the project's step.

## Consequences

- A project with an SDK has a cross-origin surface and serves one HTML page from its API. A
  change under `api/sdk/`, or in the SDK's `transport/`, `entries/`, `protocol/` or `frame/`,
  asks the harness for its security review.
- Three things are promises no check enforces yet: `v1` only grows, `protocol/` only grows
  within a major, and an old major's frame stays served.
- A view from Firefox or WebKit says less than one from Chromium (F4). The field that says so
  ships; a product that ignores it pays for hidden frames in those engines.
- The host adds `frame-src`, and a unit in a frame does not inherit the page's fonts or
  styles: the theme of F5 is all the likeness there is until the second renderer exists.
- A release of the SDK reaches every host page within the cache's lifetime. The kill switch and
  invariant 2 are what stand between a bad release and a broken host.
- `split` with an SDK needs Compose 2.35.0.
- The spikes ran on Windows, in Playwright's builds. Safari itself, a mobile engine, a tab in
  the background, a tab closed from the browser's own controls and Linux are not verified;
  neither is the Worker's serving of the files, which the template's case proves.

## Out of scope

- The Shadow DOM renderer, and a data-only mode.
- An SDK in a plan with no API package, or beside a lone `--template` package.
- A second SDK in one plan; a namespace per SDK.
- Framework adapters (`<package>/react`), a publish workflow in CI.
- An SDK for a runtime other than the browser.
- A product's own SDK entities, its key entity and the console that issues keys; everything in
  N6; accreditation of the meter by a measurement body.
- A check that `v1` and `protocol/` only grow; a store of old builds.
