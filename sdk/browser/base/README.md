# **PROJECT_NAME**-sdk

An embeddable browser SDK. It asks the API for content, draws it in a frame from the API's
origin and reports `rendered`, `viewed`, `clicked` and `error` back to your page.

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
import { init, on, setConsent } from '__PROJECT_NAME__-sdk'

on('error', (event) => console.warn(event.message))
setConsent('granted') // telemetry waits for this
init({ key: 'pk_your_key', apiOrigin: 'https://api.example.test' })
```

The tag and the npm package expose the same calls: `init(options)`, `destroy()`,
`on(event, handler)`, `setConsent(state)` and `version`. A tag that cannot run `init` itself can
queue calls before the file loads: `window.__SDK_GLOBAL__ = [['init', { key: 'pk_your_key' }]]`.

## Your content security policy

Add the API's origin to `script-src`, `connect-src` and `frame-src`. Nothing is needed for
styles. If you load the script from an inline tag, it needs a nonce or a hash; under Trusted Types
use the tag with `src`.

## Good to know

- The SDK adds one container and one iframe to your page and no style or markup. It adds no
  listener while idle; once consent is granted and something is tracked it listens to
  `visibilitychange` and `pagehide` to send that telemetry. It never throws into your code: a
  failure reaches your `error` handler. Calls the unit's frame makes to the API come from the
  API's origin, never yours, and what the frame holds does not reach your page.
- It uses one global and leaves a name your page already uses alone; a second tag does nothing.
- Keep the unit's element where it is when your page re-renders: a moved iframe reloads.
- The browser logs a blocked or refused request in the console. The SDK cannot hide that line.
- The server can turn the SDK off: nothing is drawn then, and nothing changes on your page.
- Telemetry is sent only after `setConsent('granted')`.
