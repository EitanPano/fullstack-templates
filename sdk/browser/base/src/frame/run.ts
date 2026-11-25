import {
  MODULE_FAILED,
  PROTOCOL_VERSION,
  isErrorCode,
  isKey,
  isModuleName,
  parseHostMessage,
  themeFromParams,
  type ConsentState,
  type FrameMessage,
  type Occlusion,
  type SdkEventName,
  type Theme,
} from '../protocol'

import { listenForHandshake } from './handshake'
import { createMeter } from './meter'
import { createSender } from './sender'
import { observeHeight } from './size'

/** What a module's frame half is given. It draws into `mount`, with text nodes and `el.style`. */
export type FrameContext = {
  mount: HTMLElement
  key: string
  theme(): Theme
  consent(): ConsentState
  /**
   * `viewed` is the meter's alone: a module cannot claim a view. The host sees a fixed code
   * only: a text that is not a code (`module_failed`, `load_failed`) is replaced by
   * `module_failed`, so nothing the module holds reaches the host page.
   */
  report(name: Exclude<SdkEventName, 'viewed'>, code?: string): void
  /**
   * The meter's verdict, once, with the checks that ran. It starts when the module reports
   * `rendered`, so what is measured is what is drawn. The proof of a view (a token) goes to the
   * API from here through `request`; it never crosses the channel.
   */
  onView(handler: (occlusion: Occlusion) => void): void
  /** A message for this module's host half. */
  send(payload: unknown): void
  /** The messages the host half sends this module. */
  onMessage(handler: (payload: unknown) => void): void
  /** Telemetry from the frame itself, sent once consent allows. */
  track(item: unknown): void
  /** A call to the API from the frame's own origin: how a module reaches an entity the server
   *  mounts behind `frameOnly`. It is not telemetry and does not wait for consent. */
  request(path: string, body?: unknown): Promise<unknown>
}

export type FrameModule = {
  name: string
  start(context: FrameContext): void | (() => void)
}

export type RunOptions = {
  win: Window
  modules: FrameModule[]
  fetch?: typeof fetch
}

type Body<T> = T extends unknown ? Omit<T, 'v'> : never

// The theme is written through the CSSOM: the frame's policy allows no inline style, and a
// value was checked against a pattern before it got here. The scheme is always declared: with
// none, the frame paints white on a dark page, and `light dark` is opaque in two engines.
function applyTheme(doc: Document, theme: Theme): void {
  const root = doc.documentElement.style
  root.setProperty('color-scheme', theme.scheme ?? 'light')
  const vars = {
    '--sdk-text': theme.text,
    '--sdk-accent': theme.accent,
    '--sdk-radius': theme.radius,
    '--sdk-font': theme.font,
  }
  for (const [name, value] of Object.entries(vars)) {
    if (value) root.setProperty(name, value)
    else root.removeProperty(name)
  }
}

/** The frame's kernel: runs inside the frame document, where `entries/frame.ts` calls it. */
export function runFrame(options: RunOptions): { stop(): void } {
  const { win } = options
  const doc = win.document
  const params = new URLSearchParams(win.location.search)
  const rawKey = params.get('k')
  const key = isKey(rawKey) ? rawKey : ''
  // The one module this frame serves, named in its address by the host half that drew the frame.
  const wanted = params.get('m')
  let theme = themeFromParams(params)
  let consent: ConsentState = 'denied'
  const cleanups: Array<() => void> = []

  applyTheme(doc, theme)
  doc.documentElement.style.setProperty('margin', '0')
  doc.body.style.setProperty('margin', '0')

  const sender = createSender({
    key,
    win,
    allowed: () => consent === 'granted',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
  cleanups.push(sender.dispose)

  const stopListening = listenForHandshake({
    win,
    onPort(port) {
      const send = (message: Body<FrameMessage>) =>
        port.postMessage({ v: PROTOCOL_VERSION, ...message })
      const handlers = new Map<string, Array<(payload: unknown) => void>>()
      const viewHandlers: Array<(occlusion: Occlusion) => void> = []
      const failed = (module: string) =>
        send({
          type: 'event',
          name: 'error',
          message: MODULE_FAILED,
          ...(isModuleName(module) ? { module } : {}),
        })
      const report = (name: Exclude<SdkEventName, 'viewed'>, code?: string) => {
        if (name === 'rendered') startMeter()
        if (name !== 'error') return send({ type: 'event', name })
        send({ type: 'event', name, message: isErrorCode(code) ? code : MODULE_FAILED })
      }

      port.onmessage = (event) => {
        const message = parseHostMessage(event.data)
        if (!message) return
        switch (message.type) {
          case 'theme':
            theme = message.theme
            applyTheme(doc, theme)
            break
          case 'consent':
            consent = message.state
            break
          case 'module':
            for (const handler of handlers.get(message.name) ?? []) {
              try {
                handler(message.payload)
              } catch {
                failed(message.name)
              }
            }
            break
          case 'destroy':
            runCleanups()
            break
        }
      }

      const mount = doc.createElement('div')
      doc.body.appendChild(mount)
      cleanups.push(
        () => mount.remove(),
        () => port.close(),
      )

      cleanups.push(observeHeight({ win, report: (height) => send({ type: 'size', height }) }))

      // The meter measures what is drawn, so it starts when the module says it has drawn.
      let metering = false
      function startMeter() {
        if (metering) return
        metering = true
        cleanups.push(
          createMeter({
            win,
            target: mount,
            onView(occlusion) {
              for (const handler of viewHandlers) {
                try {
                  handler(occlusion)
                } catch {
                  // A module's handler failing does not stop the report to the host.
                }
              }
              send({ type: 'event', name: 'viewed', occlusion })
            },
          }).stop,
        )
      }

      // One frame serves one module: the one the address names. An unknown or missing name starts
      // nothing and says so with the fixed code.
      const module = options.modules.find((candidate) => candidate.name === wanted)
      if (!module) {
        failed(wanted ?? '')
        return
      }
      try {
        const cleanup = module.start({
          mount,
          key,
          theme: () => theme,
          consent: () => consent,
          report,
          onView: (handler) => void viewHandlers.push(handler),
          send: (payload) => send({ type: 'module', name: module.name, payload }),
          onMessage: (handler) =>
            handlers.set(module.name, [...(handlers.get(module.name) ?? []), handler]),
          track: sender.push,
          request: sender.request,
        })
        if (typeof cleanup === 'function') cleanups.push(cleanup)
      } catch {
        failed(module.name)
      }
    },
  })
  cleanups.push(stopListening)

  function runCleanups() {
    for (const cleanup of cleanups.splice(0)) {
      try {
        cleanup()
      } catch {
        // A cleanup that fails does not stop the others.
      }
    }
  }
  return { stop: runCleanups }
}
