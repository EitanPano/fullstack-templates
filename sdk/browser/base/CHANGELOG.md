# Changelog

## 1.0.0

- The kernel: `init`, `mount`, `open`, `on`, `setConsent`, `setTheme`, `destroy`, `version`; the error
  boundary, the event bus, the unit registry and the kill switch. A module is a declaration on the
  host page and a frame half; a unit reports `rendered`, `closed` and `error`, and the module's own
  events.
- Modal modules: `display: 'modal'` is shown by `open` in a dialog over the page, one at a time. A
  page that removes the dialog closes it with `host`; a modal that has not drawn in 10 s closes with
  `timeout`; a unit told `denied` stays in the page until its frame acknowledges (300 ms at most).
- Slots: a page marks elements with the SDK's attribute, and the tag mounts them; `observe` also
  follows later changes.
- The transport, the protocol, the iframe and its channel, and the frame: handshake, size,
  stylesheet (`frame.css`), images, telemetry, and the view helper.
- Three outputs: the npm entry (ESM, CJS, types), the CDN loader, and the frame (script, sheet and
  document).
