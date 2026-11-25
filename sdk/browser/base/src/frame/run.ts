import {
  PROTOCOL_VERSION,
  parseHostMessage,
  themeFromParams,
  type ConsentState,
  type FrameMessage,
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
  /** `viewed` is the meter's alone: a module cannot claim a view. */
  report(name: Exclude<SdkEventName, 'viewed'>, message?: string): void
  /** A message for this module's host half. */
  send(payload: unknown): void
  /** The messages the host half sends this module. */
  onMessage(handler: (payload: unknown) => void): void
  /** Telemetry from the frame itself, sent once consent allows. */
  track(item: unknown): void
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

const MAX_TEXT = 200

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
  const key = params.get('k') ?? ''
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
      const report = (name: Exclude<SdkEventName, 'viewed'>, message?: string) =>
        send(
          message === undefined
            ? { type: 'event', name }
            : { type: 'event', name, message: message.slice(0, MAX_TEXT) },
        )

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
              } catch (error) {
                report('error', error instanceof Error ? error.message : String(error))
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
      cleanups.push(
        createMeter({
          win,
          target: mount,
          onView: (occlusion) => send({ type: 'event', name: 'viewed', occlusion }),
        }).stop,
      )

      for (const module of options.modules) {
        try {
          const cleanup = module.start({
            mount,
            key,
            theme: () => theme,
            consent: () => consent,
            report,
            send: (payload) => send({ type: 'module', name: module.name, payload }),
            onMessage: (handler) =>
              handlers.set(module.name, [...(handlers.get(module.name) ?? []), handler]),
            track: sender.push,
          })
          if (typeof cleanup === 'function') cleanups.push(cleanup)
        } catch (error) {
          report('error', error instanceof Error ? error.message : String(error))
        }
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
