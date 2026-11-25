import {
  DATA_MAX_BYTES,
  MODULE_FAILED,
  PROPS_MAX_BYTES,
  PROTOCOL_VERSION,
  checkJson,
  checkJsonObject,
  isKey,
  isModuleName,
  parseHostMessage,
  themeFromParams,
  type ConsentState,
  type Display,
  type FrameMessage,
  type Props,
  type Theme,
} from '../protocol'

import { listenForHandshake } from './handshake'
import { createSender } from './sender'
import { observeHeight } from './size'

/** What a module's frame half is given. It draws into `mount`, with text nodes and `el.style`. */
export type FrameContext = {
  /** The element to draw into. The kernel sets `data-module` on it. */
  mount: HTMLElement
  display: Display
  /** The current props of the unit. */
  props(): Props
  /** Called with the props of each later update. */
  onProps(handler: (props: Props) => void): void
  /**
   * An event for the host page, delivered there as `<module>:<name>`. A name outside the module
   * name pattern, and data that is not JSON or is over 8,192 bytes, are dropped. Nothing the
   * server counts, no token and no server text goes through it.
   */
  emit(name: string, data?: unknown): void
  /** Asks the host to close this unit. */
  close(): void
  /**
   * A call to the API from the frame's own origin: how a module reaches an entity the server
   * mounts behind `frameOnly`. It is not telemetry and does not wait for consent.
   */
  request(path: string, body?: unknown): Promise<unknown>
  /** Telemetry from the frame itself: buffered, dropped before consent, sent when it is allowed. */
  track(item: unknown): void
}

export type FrameModule = {
  name: string
  /**
   * Draws the unit. The kernel reports `rendered` when this returns or its promise resolves, and
   * `module_failed` (never the text) when it throws or rejects. There is no cleanup: the unit
   * ends with its iframe, which takes the frame's timers and listeners with it.
   */
  start(ctx: FrameContext): void | Promise<void>
}

export type RunOptions = {
  win: Window
  modules: FrameModule[]
  fetch?: typeof fetch
}

type Body<T> = T extends unknown ? Omit<T, 'v'> : never

type Started = { props: unknown; consent: ConsentState; theme: Theme; display: Display }

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

/**
 * The frame's kernel: runs inside the frame document, where `entries/frame.ts` calls it. `stop`
 * is for tests: in a page the frame ends with its iframe and nothing calls it.
 */
export function runFrame(options: RunOptions): { stop(): void } {
  const { win } = options
  const doc = win.document
  const params = new URLSearchParams(win.location.search)
  const rawKey = params.get('k')
  const key = isKey(rawKey) ? rawKey : ''
  // The one module this frame serves, named in its address by the host that drew the frame.
  const wanted = params.get('m')
  let theme = themeFromParams(params)
  let consent: ConsentState = 'denied'
  const cleanups: Array<() => void> = []

  applyTheme(doc, theme)

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
      const fail = (code: string) => send({ type: 'error', code })
      const propsHandlers: Array<(props: Props) => void> = []
      let props: Props = {}
      let started = false

      // Props that are not a plain object within the cap are answered with a code, never used.
      const takeProps = (value: unknown): Props | null => {
        const checked = checkJsonObject(value, PROPS_MAX_BYTES)
        if (checked.ok) return checked.value as Props
        fail(checked.reason === 'too_large' ? 'props_too_large' : 'bad_props')
        return null
      }

      const mount = doc.createElement('div')
      doc.body.appendChild(mount)
      cleanups.push(
        () => mount.remove(),
        () => port.close(),
      )

      function start(message: Started) {
        // One frame serves one module: the one the address names.
        const module = options.modules.find((candidate) => candidate.name === wanted)
        if (!module) return fail('unknown_module')
        const first = takeProps(message.props)
        if (!first) return
        props = first
        theme = message.theme
        applyTheme(doc, theme)
        consent = message.consent
        mount.setAttribute('data-module', module.name)
        // Before the module starts, so its sheet can follow the display from the first paint.
        doc.documentElement.setAttribute('data-display', message.display)
        if (message.display === 'modal') closeOnEscape()

        let result: ReturnType<FrameModule['start']>
        try {
          result = module.start({
            mount,
            display: message.display,
            props: () => props,
            onProps: (handler) => void propsHandlers.push(handler),
            emit(name, data) {
              if (!isModuleName(name)) return
              if (data === undefined) return send({ type: 'emit', name })
              const checked = checkJson(data, DATA_MAX_BYTES)
              if (checked.ok) send({ type: 'emit', name, data: checked.value })
            },
            close: () => send({ type: 'close' }),
            request: sender.request,
            track: sender.push,
          })
        } catch {
          return fail(MODULE_FAILED)
        }
        Promise.resolve(result).then(
          () => {
            // The size is reported from the first drawn state, so the iframe does not jump from
            // the placeholder to an empty document and then to the unit. Its first report goes
            // before `rendered`.
            cleanups.push(
              observeHeight({ win, report: (height) => send({ type: 'size', height }) }),
            )
            if (message.display === 'modal') focusMount()
            send({ type: 'rendered' })
          },
          () => fail(MODULE_FAILED),
        )
      }

      // Escape in the frame never reaches the host's dialog: ask the host to close, unless the
      // module used the key (its handler runs first, on the way up to the document).
      function closeOnEscape() {
        const listener = (event: KeyboardEvent) => {
          if (event.key === 'Escape' && !event.defaultPrevented) send({ type: 'close' })
        }
        doc.addEventListener('keydown', listener)
        cleanups.push(() => doc.removeEventListener('keydown', listener))
      }

      // A modal's focus is in the frame: a module that marks its first field `autofocus` gets
      // it, else the mount. A `focus()` the module makes during `start` is ignored by WebKit,
      // so the module does not make one; the kernel tries again on the next frames until it holds.
      function focusMount(triesLeft = 30) {
        let chosen = doc.activeElement as HTMLElement | null
        if (chosen && mount.contains(chosen)) return
        chosen = mount.querySelector<HTMLElement>('[autofocus]')
        if (!chosen) {
          mount.setAttribute('tabindex', '-1')
          chosen = mount
        }
        chosen.focus()
        if (!mount.contains(doc.activeElement) && triesLeft > 0) {
          win.requestAnimationFrame(() => focusMount(triesLeft - 1))
        }
      }

      port.onmessage = (event) => {
        const message = parseHostMessage(event.data)
        if (!message) return
        switch (message.type) {
          case 'start':
            if (started) break
            started = true
            start(message)
            break
          case 'props': {
            if (!started) break
            const next = takeProps(message.props)
            if (!next) break
            props = next
            for (const handler of propsHandlers) {
              try {
                handler(props)
              } catch {
                fail(MODULE_FAILED)
              }
            }
            break
          }
          case 'theme':
            theme = message.theme
            applyTheme(doc, theme)
            break
          case 'consent':
            consent = message.state
            send({ type: 'ack', state: message.state })
            break
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
