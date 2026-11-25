# `__PROJECT_NAME__-sdk`

An embeddable browser SDK. Your page mounts units of it: each is drawn in a frame from the API's
origin, and the SDK tells your page what happened to it.

## Install

From a script tag (the API serves the file):

```html
<script
  async
  src="https://api.example.test/api/sdk/dist/v1/loader.js"
  data-key="pk_your_key"
></script>
```

From npm:

```ts
import { init, mount, on, setConsent } from '__PROJECT_NAME__-sdk'

on('error', (event) => console.warn(event.code))
setConsent('granted') // telemetry waits for this
init({ key: 'pk_your_key', apiOrigin: 'https://api.example.test' })
```

The tag and the npm package expose the same calls: `init(options)`, `mount(module, target, props?)`,
`open(module, props?)`, `on(event, handler)`, `setConsent(state)`, `setTheme(theme)`, `destroy()` and `version`. A tag that
cannot run `init` itself can queue calls before the file loads:
`window.__SDK_GLOBAL__ = [['init', { key: 'pk_your_key' }]]`. A queue entry may also be a function,
called with the global once the tag has started the SDK. The tag's global alone also has
`push(...entries)`, which runs an entry the same way, so
`(window.__SDK_GLOBAL__ = window.__SDK_GLOBAL__ || []).push(fn)` works before or after the file loads.

## Mount a unit

```ts
const unit = mount('module-name', document.querySelector('#place'), { text: 'Hello' })
unit.update({ text: 'Changed' })
unit.close()
```

`mount` never throws. A refusal is an `error` event and an inert handle. Props are a plain JSON
object of at most 8,192 bytes.

## Open a dialog

A module that declares `display: 'modal'` is shown with `open`, in a dialog over the page, not
`mount`:

```ts
const unit = open('module-name', { text: 'Hello' })
unit.close()
```

`open` returns the same handle as `mount`. One dialog at a time: a second `open` reports
`modal_open`, and `mount` of a modal module (or `open` of an inline one) reports `bad_display`.
While the dialog is open the page is inert and its scroll is locked; when it closes, focus goes back
to the element that had it. A user closes it with Escape or the module's own button, and `closed`
then has the `reason` `frame`. A page that removes the dialog (a body swap on a route change) closes
it with `host`.

## Mount from markup

A page that cannot run script marks an element instead, and the tag mounts it:

```html
<div __SDK_SLOT__="module-name" data-text="Hello"></div>
```

Only the `data-` attributes the module lists become props, a name such as `itemId` being read
from `data-item-id`; any other stays on your page. Add
`data-observe` to the tag to mount elements added later and close the unit of one you remove.

## Events

`on(name, handler)` returns the function that stops it. The events of a unit name its `module` and
`unit`, and reach you after `mount` has returned the unit, a refusal included. The errors of the SDK
itself (`bad_key`, `config_failed`, `global_taken`, `bad_slot`, `internal` and the like) name no unit.

- `rendered`: the unit has drawn, once.
- `closed`, with a `reason`: `host`, `frame` (the module closed itself), `timeout`, `failed`,
  `disabled` or `slot_removed`.
- `error`, with a `code` (`unknown_module`, `bad_slot`, `bad_display`, `modal_open`, `module_failed`, and others):
  a fixed code, never text.
- `<module>:<event>`, with `data`: what the module chose to tell your page.

## Your content security policy

Add the API's origin to `script-src`, `connect-src` and `frame-src`. Nothing is needed for styles
or images. If you load the script from an inline tag, it needs a nonce or a hash; under Trusted
Types use the tag with `src`.

## Good to know

- The SDK adds one container and one iframe to your page for each unit, and no style or markup. It
  adds no listener, and no observer unless you ask for one with `observe`. It never throws into
  your code: a failure reaches your `error` handler. The frame's calls to the API come from the
  API's origin, never yours, and what the frame holds does not reach your page.
- It uses one global and leaves a name your page already uses alone; a second tag does nothing.
- Keep the unit's element where it is when your page re-renders: a moved iframe reloads.
- A frame that does not load in 20 seconds, or does not answer in 4 once loaded, is removed and
  reported as `closed` with `timeout`.
- A page holds 50 units at most; the 51st is an `error` with the code `too_many_units`.
- The browser logs a blocked or refused request in the console. The SDK cannot hide that line.
- The server can turn the SDK off: nothing is drawn then, and nothing changes on your page.
- Telemetry is sent from the frame, and only after `setConsent('granted')`.
