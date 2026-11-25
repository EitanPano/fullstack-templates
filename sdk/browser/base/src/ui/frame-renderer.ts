import {
  HANDSHAKE_KIND,
  PROTOCOL_VERSION,
  parseFrameMessage,
  themeToParams,
  type ConsentState,
  type Theme,
} from '../protocol'

import type { Renderer, RendererOptions } from './renderer'

// Never `allow-top-navigation`: without the attribute a frame navigated its host (ADR 0020 F2).
export const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'

export type FrameRendererOptions = RendererOptions & {
  /** The SDK package's major: each major has its own frame build. */
  major: number
  handshakeTimeoutMs?: number
}

type Body =
  | { type: 'theme'; theme: Theme }
  | { type: 'consent'; state: ConsentState }
  | { type: 'module'; name: string; payload: unknown }

const DEFAULT_PLACEHOLDER = 100
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 4000

/** The host half of the frame renderer: a container, an iframe, a channel and a timeout. */
export function createFrameRenderer(options: FrameRendererOptions): Renderer {
  const timeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
  const placeholder = `${options.placeholderHeight ?? DEFAULT_PLACEHOLDER}px`
  let container: HTMLElement | null = null
  let iframe: HTMLIFrameElement | null = null
  let port: MessagePort | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const setHeight = (value: string) => {
    container?.style.setProperty('height', value)
    iframe?.style.setProperty('height', value)
  }
  const show = (visible: boolean) => {
    if (visible) container?.style.removeProperty('display')
    else container?.style.setProperty('display', 'none')
  }
  const send = (message: Body) => {
    port?.postMessage({ v: PROTOCOL_VERSION, ...message })
  }

  // The frame's `load` is only the moment to try: a refused frame fires it too (ADR 0020 F1).
  // Only an answer on the channel counts, and a reload of the frame starts a new handshake.
  const handshake = () => {
    const win = iframe?.contentWindow
    if (!win) return
    port?.close()
    const channel = new MessageChannel()
    port = channel.port1
    port.onmessage = (event) => {
      const message = parseFrameMessage(event.data)
      if (!message) return
      switch (message.type) {
        case 'ready':
          clearTimeout(timer)
          show(true)
          options.onReady?.()
          break
        case 'size':
          setHeight(`${Math.ceil(message.height)}px`)
          break
        case 'event':
          options.onEvent(message)
          break
        case 'module':
          options.onModuleMessage?.(message.name, message.payload)
          break
      }
    }
    win.postMessage({ kind: HANDSHAKE_KIND, v: PROTOCOL_VERSION }, options.apiOrigin, [
      channel.port2,
    ])
    clearTimeout(timer)
    timer = setTimeout(() => {
      show(false)
      options.onCollapse?.()
    }, timeoutMs)
  }

  return {
    mount(target) {
      const doc = target.ownerDocument
      const url = new URL(`/api/sdk/frame/v${options.major}`, options.apiOrigin)
      url.searchParams.set('k', options.key)
      for (const [name, value] of themeToParams(options.theme)) url.searchParams.set(name, value)

      container = doc.createElement('div')
      iframe = doc.createElement('iframe')
      iframe.setAttribute('sandbox', SANDBOX)
      iframe.setAttribute('title', 'Sponsored content')
      iframe.addEventListener('load', handshake)
      iframe.style.setProperty('display', 'block')
      iframe.style.setProperty('width', '100%')
      iframe.style.setProperty('border', '0')
      setHeight(placeholder)
      container.appendChild(iframe)
      target.appendChild(container)
      // The address is set last: the frame starts loading with the attributes already in place.
      iframe.setAttribute('src', url.href)
      clearTimeout(timer)
      timer = setTimeout(() => {
        show(false)
        options.onCollapse?.()
      }, timeoutMs)
    },
    setTheme(theme: Theme) {
      send({ type: 'theme', theme })
    },
    setConsent(state: ConsentState) {
      send({ type: 'consent', state })
    },
    sendModule(name, payload) {
      send({ type: 'module', name, payload })
    },
    destroy() {
      clearTimeout(timer)
      port?.close()
      port = null
      container?.remove()
      container = null
      iframe = null
    },
  }
}
