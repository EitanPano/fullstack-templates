import {
  HANDSHAKE_KIND,
  PROTOCOL_VERSION,
  isModuleName,
  own,
  parseFrameMessage,
  themeToParams,
  type FrameMessage,
  type HostMessage,
  type Theme,
} from '../protocol'

// Never `allow-top-navigation`: without the attribute a frame navigated its host (ADR 0020 F2).
export const SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms'

export type UnitFrameOptions = {
  /** The document the iframe is made in: the one of the page it will go on. */
  doc: Document
  apiOrigin: string
  key: string
  /** The module of this unit: its name goes in the frame's address. */
  module: string
  /** The iframe's accessible title, given by the module: the kernel holds no default text. */
  title: string
  /** The SDK package's major: each major has its own frame build. */
  major: number
  theme: Theme
  /** How long a loaded frame has to answer the handshake. */
  handshakeTimeoutMs?: number
  /** How long a frame has to load at all, counted from its creation. */
  loadTimeoutMs?: number
  /** The frame answered the handshake: the channel is open, and the host may send. */
  onReady(): void
  /** Everything else the frame says: `size`, `rendered`, `error`, `emit` and `close`. */
  onMessage(message: Exclude<FrameMessage, { type: 'ready' }>): void
  /** The frame did not load, or did not answer the handshake, in time. Called once. */
  onTimeout(): void
}

type Body<T> = T extends unknown ? Omit<T, 'v'> : never

export type UnitFrame = {
  /** Not in the page yet: whoever places it (inline or in a dialog) appends it. */
  iframe: HTMLIFrameElement
  /** Sends to the frame; before the channel is open the message is dropped. */
  send(message: Body<HostMessage>): void
  /** Closes the channel and the timers and stops listening; sends nothing. The iframe stays. */
  dispose(): void
}

// The handshake budget runs from the iframe's `load`; the frame's own download is not in it. A
// frame that never loads is ended by the longer cap.
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 4000
const DEFAULT_LOAD_TIMEOUT_MS = 20_000

/**
 * The iframe of a unit and its channel: sandbox, address, handshake and timeouts. Where it sits
 * on the page is not its business.
 */
export function createUnitFrame(options: UnitFrameOptions): UnitFrame {
  if (options.title.trim() === '') throw new Error('a unit needs a title from its module')
  if (!isModuleName(options.module)) throw new Error('a unit needs its module name')
  const timeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
  const loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS
  let port: MessagePort | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const url = new URL(`/api/sdk/frame/v${options.major}`, options.apiOrigin)
  url.searchParams.set('k', options.key)
  url.searchParams.set('m', options.module)
  for (const [name, value] of themeToParams(options.theme)) url.searchParams.set(name, value)

  const iframe = options.doc.createElement('iframe')
  iframe.setAttribute('sandbox', SANDBOX)
  iframe.setAttribute('title', options.title)
  // A frame whose scheme differs from its page's is opaque, so the element follows the theme.
  const setScheme = (theme: Theme) =>
    iframe.style.setProperty('color-scheme', own(theme, 'scheme') ?? 'light')
  setScheme(options.theme)
  iframe.style.setProperty('display', 'block')
  iframe.style.setProperty('width', '100%')
  iframe.style.setProperty('border', '0')

  const timeout = () => {
    clearTimeout(timer)
    clearTimeout(loadTimer)
    options.onTimeout()
  }

  // The frame's `load` is only the moment to try: a refused frame fires it too (ADR 0020 F1).
  // Only an answer on the channel counts, and a reload of the frame starts a new handshake.
  const handshake = () => {
    const win = iframe.contentWindow
    if (disposed || !win) return
    port?.close()
    const channel = new MessageChannel()
    port = channel.port1
    port.onmessage = (event) => {
      const message = parseFrameMessage(event.data)
      if (disposed || !message) return
      if (message.type === 'ready') {
        clearTimeout(timer)
        options.onReady()
      } else {
        options.onMessage(message)
      }
    }
    win.postMessage({ kind: HANDSHAKE_KIND, v: PROTOCOL_VERSION }, options.apiOrigin, [
      channel.port2,
    ])
    clearTimeout(loadTimer)
    clearTimeout(timer)
    timer = setTimeout(timeout, timeoutMs)
  }

  iframe.addEventListener('load', handshake)
  // Sandbox and address are in place before the iframe is in the page: it starts loading with
  // them, and no `load` fires for an empty document first (WebKit does, and a handshake to
  // that document is refused with a console error).
  iframe.setAttribute('src', url.href)
  const loadTimer = setTimeout(timeout, loadTimeoutMs)

  return {
    iframe,
    send(message) {
      if (message.type === 'theme') setScheme(message.theme)
      port?.postMessage({ v: PROTOCOL_VERSION, ...message })
    },
    dispose() {
      // A closed unit is inert: a page that re-inserts its container starts no handshake. The
      // frame needs no word: its buffer goes out on page hide when the iframe leaves the page.
      disposed = true
      iframe.removeEventListener('load', handshake)
      clearTimeout(timer)
      clearTimeout(loadTimer)
      port?.close()
      port = null
    },
  }
}
