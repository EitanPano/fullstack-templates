# ADR 0021: SDK units, a generic base for the embeddable SDK

Status: accepted, 2026-11-25, by the owner ("start working on the modal"). Catalog release
`v1.18.0`, the same that carries [ADR 0020](0020-sdk-kind.md): `sdk/browser` 1.0.0 and the three
server minors are not tagged yet, so everything below changes them in place, with no major.
The decisions marked ▲ are the session's; the others are the owner's rulings ("the harness
and templates provide a generic, modular, easy-to-understand base for an embeddable browser
SDK … The base must not contain niche-specific code"; "remove what's not needed, fix what's
wrong and do the improvements"; CJS stays; the view meter is an "opt-in frame helper").

## Context

ADR 0020 built a guest that is safe on someone else's page. A first module written on it (the
proof of the harness's plan 033) and a read of the template showed what it is not yet:

- A host page can start the SDK and nothing else. It cannot mount a unit, open a module or pass
  it data; a module starts once, so an element added later is never served.
- A module cannot tell the page anything of its own: `on` takes four fixed names, and an event
  names no unit and carries no data.
- Only an inline mount exists.
- Every module's host half repeats the same wiring: the proof's copied the fixture's 25 lines.
- A module styles through `el.style` alone, because the frame's policy has no `style-src`: no
  media query, no `:hover`, no `:focus-visible`. A sandbox without `allow-forms` fires no
  `submit`.
- The frame's telemetry posts to a path no server has. The key resolver is synchronous, so the
  lookup a product is told to put there cannot be one.
- The kernel carries one product's shape: `viewed`, `clicked` and `occlusion` in the public
  types, a meter that runs for every unit, a guide that explains tokens, clicks and payment.
- Three parts serve nothing: the `Renderer` interface (ADR 0020 R1's own note says it cannot
  serve a second renderer), the module bus (no two modules exist), host-side telemetry.

What ADR 0020 measured stays true and is not repeated here: where a unit is drawn (R1), who may
frame it (F1), the sandbox and the frame's limits (F2), the channel (F3's handshake), size and
look (F5), the namespace and its gate (N1, N2), the served files (N4, N5), the tools (T3).

A third spike, S3, ran for this record (Playwright 1.65.0; Chromium, Firefox, WebKit). Its
results are cited where they decide a rule.

## Decisions

### U1. A module is a declaration and a frame half

▲ On the host side a module is data: `{ name, title, display?, placeholderHeight?, slot? }`.
The kernel creates the iframe, runs the handshake, relays theme, consent and events, and closes
the unit. No module code runs on the host page.

- Why no host hook: every use the proof had for one (reading the page's context, closing an
  empty unit) is a prop or a call of the frame. An optional hook is an added field later, a
  minor; a hook shipped now brings the copied wiring back.
- A module's frame half is `FrameModule.start(ctx)`, as before. `start` may return a promise:
  resolved means drawn (`rendered`), rejected or thrown means `error` with `module_failed`.
- A **unit** is one mounted instance of a module. Every event names its `module` and `unit`.

This replaces ADR 0020 R1's "one interface in `ui/`" and T1's "modules meet through the
registry and the bus". Both were kept for a second renderer and a second module that do not
exist; each is an addition when it does.

### U2. One data path each way

▲ Host page to frame: `props`, a plain JSON object of at most 8 KB, sent with the `start`
message and again on `update`. Frame to host page: `ctx.emit(name, data?)`, delivered as
`<module>:<name>` with `data` of at most 8 KB.

- Each side checks what it receives. The frame checks `props` again because a page that
  replaces the loader skips the loader's check.
- ADR 0020 F3 let only fixed reports cross the channel. `emit` lets a module send what it
  chooses, so the rule moves from code to the guide and the review: nothing the server counts,
  no token and no server text goes into an event. A change in a module's frame half already
  asks the harness for its security review.
- The kernel's own events are `rendered`, `closed` (with a reason: `host`, `frame`, `timeout`,
  `failed`, `disabled`, `slot_removed`) and `error` (with a fixed code, never text). A
  handshake that never completes is reported as `closed` with `timeout`; under ADR 0020 F1 it
  was silent, which leaves a page's own button doing nothing.

### U3. The public surface

▲ `init`, `mount(module, target, props?)`, `open(module, props?)`, `on(name, handler)`,
`setConsent`, `setTheme`, `destroy`, `version`, the same on the npm entry and the CDN global.

- `mount` and `open` return one handle: `{ id, module, update(props), close() }`. Neither
  throws; a refused call reports an `error` code and returns an inert handle. No event of a
  unit fires before the call has returned its handle.
- A call made after `init` and before the kill switch is read waits; a disabled SDK reports
  `closed` with `disabled` for each. An instance holds at most 50 units, waiting or live, from
  calls and slots alike (`too_many_units`): markup a sanitizer lets through could otherwise
  plant frames without end.
- The tag's queue takes the new calls, and a function entry called with the global, since a
  queued tuple cannot hand back a handle. The global keeps a `push`, so the usual stub works
  after the file has loaded too.
- Options, a theme and a declaration are read through own properties only: a host page with a
  prototype-pollution bug of its own must not be able to move the API's origin or grant
  consent through the SDK.
- `setTheme` is new: the protocol had a theme message no public call could send.

### U4. Slots

▲ At `init`, and again on `DOMContentLoaded` when the tag ran before the document was parsed,
the kernel mounts each element that carries the SDK's one attribute (written by the generator
beside the global's name). A page under a strict policy that cannot run an inline script
configures a unit this way and no other.

- Only a module that declares `slot` is mounted from markup, only the attributes its
  `slot.props` lists become props, and never a `modal`. A sanitizer lets `data-*` attributes
  through, so content a visitor wrote could otherwise plant a unit or open a dialog, and a
  blanket read would copy the page's own attributes into the frame.
- Watching for slots added or removed later is opt-in (`init({ observe: true })`, or
  `data-observe` on the tag). A guest adds nothing standing to a page unless asked; a page with
  script calls `mount` when it adds an element.

### U5. Display

▲ `inline` is ADR 0020's mount. `modal` is new: `open` puts the frame, at the size of the
viewport and transparent, in a `<dialog>` the kernel creates and opens with `showModal()`.

S3, the same in the three engines unless a line names one:

- The dialog sits in a closed shadow root on a container the kernel appends to `body`, styled
  through the CSSOM. There it is above a page element of the highest `z-index`, the page behind
  it is inert, the page's own `dialog {}` and `iframe {}` rules do not reach it, and the host's
  strict policy raises nothing.
- A frame in a dialog that is not open yet loads and answers the handshake, with a viewport of
  0 by 0. So the order is: handshake, `showModal()`, then the `start` message; a module never
  measures a hidden frame. The page is never left inert behind a frame that does not answer: a
  timeout closes the unit before the dialog opens, a failed module closes it after, and a
  module that has not drawn within ten seconds of `start` is closed with `timeout` (a phone
  has no Escape, and the scrim closes nothing).
- A page may replace its own body while a modal is open (a client-side router does on every
  visit), and a removed dialog fires no event. While a modal is shown the kernel watches the
  children of `body` and of the root element, and closes the unit when its container has left
  the page. An inline unit needs no watcher: one whose frame has left the page is closed the
  next time a unit is asked for, so it never counts against the cap.
- Focus moves into the frame and typing lands there. Tab never reaches the page; it passes one
  empty stop before it wraps, which the kernel leaves alone. On close the kernel removes the
  dialog and focuses the element that had focus at `open`. WebKit focuses no button on a mouse
  click, so after one there is nothing to return to and focus falls to the page's body, as it
  does for that page's own dialogs.
- Escape pressed inside the frame never reaches the dialog. The frame's kernel hears it and
  asks to close, unless the module prevented the key; the dialog's own `cancel` covers focus
  outside the frame. Both report `closed` with `frame`. A click on the scrim closes nothing,
  as for a dialog of the platform; a module adds that itself.
- The page shows through the frame only when the frame's `color-scheme` and the page's agree.
  The kernel sets the frame's scheme on the iframe element, which makes it hold in all four
  combinations; it does so for an inline unit too. The default backdrop dims the page by a
  tenth; a sheet adopted on the shadow root clears it, and the frame paints its own scrim.
- `overscroll-behavior: contain` in the frame does not stop WebKit from scrolling the page
  behind. While a modal is open the kernel sets `overflow: hidden` on the page's `html` and
  puts the earlier value back on close, unless the page or another SDK has changed it
  meanwhile. It is the one style the SDK sets on a host's element, and only then.
- At 390 by 844 the dialog and the frame fill the viewport exactly.
- Without `allow-forms` Chromium and Firefox fire no `submit` and run no validation. `sandbox`
  gains it; the frame's policy keeps `form-action 'none'`, under which a handled form raises
  nothing and an unhandled one navigates nowhere, by a reported violation.
- One modal at a time; a second `open` reports `modal_open`. The display is the module's,
  declared once: `mount` of a modal module and `open` of an inline one report `bad_display`.
- A new risk, stated in the guide: a host can make the dialog invisible and collect clicks
  over what looks like its own page. An action the server counts in a modal needs the view
  helper's check first (U7), and ADR 0020 N6 still applies. S3 in Chromium: the check answers
  "not visible" for a dialog at no opacity and for one covered by another dialog or a popover;
  opacity on the container does not hide a top-layer dialog at all.

### U6. Styling in the frame

▲ The build writes `frame.css` beside `frame.js`, the frame document links it, and the frame's
policy gains `style-src 'self'`. The sheet is a small base (a reset, the theme's tokens with
defaults, a focus ring, reduced motion) followed by each module's `frame.css`, scoped under the
`data-module` the kernel sets on the mount; the build refuses a module's rule outside that
scope, an `@import`, an `@font-face` and a `url()`. `el.style` stays for a value known only at
run time.

- S3: the linked sheet applies under that policy, served as `text/css` with `nosniff`; a
  `<style>` element and a `style` attribute stay refused; `:hover` and `:focus-visible` work.
  A media query follows the frame's width, so a unit lays itself out by the space the page
  gives it.
- The build joins the files itself, in a few lines: the base, then `src/modules/*/frame.css`.
  The bundler writes a CSS asset only with one more package pinned to its own version (S3);
  as for the size budget and the resize loop in ADR 0020 T3, no dependency is taken for it.
- Images: the policy gains `img-src 'self'` and the origins of one server setting,
  `SDK_IMG_ORIGINS`. The frame's DOM helper gains an image beside its link (https, a text
  alternative). The frame document sends `Referrer-Policy: no-referrer`, so an image host never
  learns the frame's address, which holds the key.
- Why this does not reopen what ADR 0020 closed: `script-src` stays `'self'`, no markup sink is
  allowed in the frame (invariant 7), and a stylesheet from our own origin is ours.

### U7. The view helper

The kernel no longer measures. `observeView(target, { ratio, dwellMs, onView })` is exported
for a module's frame half, with ADR 0020 F4's logic and its `occlusion` answer; the module
sends its own event. `viewed`, `clicked` and `occlusion` leave the public types. F4's table per
engine stays enforced by the template's e2e, through a fixture.

### U8. Telemetry

▲ Telemetry is the frame's alone. The host side makes one request, the kill-switch read, and
adds no listener to the page.

- Each server gains `POST /api/sdk/v1/telemetry` (`{ events }`, 1 to 100 objects, 204), behind
  the frame-only guard, in the contract, handing the batch to a sink a product replaces; the
  default logs a count. This replaces ADR 0020 N3's "no other SDK entity ships": a client that
  posts to a path no server has is a defect, and what the endpoint stores stays the product's.
- Closing a unit removes its frame at once. S3: a message posted in the same task as the
  removal is never handled, while `pagehide` fires in the removed frame and a `keepalive`
  request from it arrives, three times of three in each engine. So the frame sends what it
  buffered on `pagehide`, the `destroy` message goes, and a module's `start` returns no
  cleanup: nothing would run it.
- The same fact has a cost: consent withdrawn and a unit closed in one task would leave the
  frame sending its buffer, never having heard the withdrawal. So the frame acknowledges a
  consent message, and a unit that was told `denied` is closed for the page at once but taken
  out of it only on that answer, or after a third of a second.

### U9. The resolver and the body

- ▲ The key resolver is asynchronous and answers a record, `{ origins, enabled }`. A key
  switched off: the kill switch answers `false`, every other endpoint refuses it, and its frame
  may be framed by nothing. A lookup that fails is never read as a valid key.
- ▲ A body under the namespace is at most 64 KB and is read only after the key is known.

## What changes in ADR 0020's invariants

| # | Was | Now |
| --- | --- | --- |
| 2 | "a container and an iframe, and no … listener beyond them" while idle | One listener at most, once, for a tag that ran before the page was parsed; with `observe`, one observer; for an open modal, one dialog, `overflow` on `html` and one observer of the page's top-level children |
| 3 | Four sandbox tokens; a frame that does not answer is collapsed in silence | `allow-forms` joins them; the unit is removed and reported `closed` with `timeout`, the wait counted from the frame's `load` |
| 4 | "Seen is the frame's word": the kernel's meter | The helper's rule: what a module measures, it measures in the frame |
| 8 | Consent before telemetry, on both sides | In the frame, the only sender |
| 9 | A buffer on each side | The frame's, flushed on page hide, which a closed unit's frame also gets |
| 10 | A disabled SDK leaves the page untouched | And a unit asked for meanwhile reports `closed` with `disabled` |
| 12 | Five headings in the agents file | Six: `Styling` joins them |

## Alternatives considered

- **Keep the host half as code, with a helper to cut the wiring.** Smaller change. Refused: the
  helper is the kernel's job, and code on the host page is what a guest should have least of.
- **A typed call per module (`sdk.booking.open()`).** Friendlier to an integrator. Refused for
  the base: the public surface would change with every module. A project adds typed wrappers
  in its own entry.
- **Every `data-*` attribute of a slot as props.** Less to declare. Refused in U4.
- **The observer on by default.** Less to explain. Refused in U4.
- **A modal built from a fixed-position container and a high `z-index`.** No dialog element.
  Refused: no top layer, no inert page, and focus handling written by hand.
- **Styles through `adoptedStyleSheets` with no policy change.** Refused: the sheet's text
  would live in the script, and a linked file is cached and budgeted on its own.
- **Remove `track` instead of adding the endpoint.** Smaller servers. Refused: the path, the
  batch and its limits are already the client's, outside any contract.
- **Remove the meter and keep a recipe.** The smallest base. Refused by the owner: the three
  engines' findings would be enforced by no test.

## Consequences

- A module is shorter and has one place for its look. The proof's module loses its host half.
- The public surface grows from five calls to eight and is now the thing an integrator codes
  against; the API report gates it as before.
- What a module sends to the page is the module author's to keep safe, where the kernel
  enforced it. The harness's security review on a module's frame half is the check.
- A modal covers the page: the clickjacking risk of U5 is new and is the product's to weigh.
- A project with an SDK gains one more environment variable and one more endpoint.
- Not verified: Safari itself, a mobile engine, a deployed Worker, as in ADR 0020.

## Out of scope

The Shadow DOM renderer; a host hook; a floating launcher display; fonts served for the frame;
a key entity and its console; everything in ADR 0020 N6.
