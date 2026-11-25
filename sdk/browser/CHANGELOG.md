# Changelog

## 1.0.0 — 2026-11-25

First release ([ADR 0020](../../docs/adr/0020-sdk-kind.md)). The kernel (`init`, `destroy`, `on`,
`setConsent`, `version`; error boundary, event bus, module registry, consent, kill switch), the
transport, the protocol, the frame renderer and the frame (handshake, size, visibility meter),
three outputs from one source, and the gates `size`, `api`, `pack:lint` and `consumers`.

`test:e2e` (the manifest's `testE2e`) runs the SDK in Chromium, Firefox and WebKit on host pages
under a strict policy, against the API package. `src/contract/` is the output of the server's
contract, and the `contract` step refuses a server without the SDK namespace.
