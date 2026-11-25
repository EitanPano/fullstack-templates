import { expect, vi } from 'vitest'

// jsdom has neither IntersectionObserver nor ResizeObserver: these stand in, with a handle to fire.
export type IntersectionHandle = {
  fire(entry: { intersectionRatio: number; isVisible?: boolean }): void
  options: IntersectionObserverInit & { trackVisibility?: boolean; delay?: number }
  disconnected: boolean
}

export function installIntersection(v2: boolean): { current: () => IntersectionHandle } {
  let handle: IntersectionHandle | undefined
  class Observer {
    constructor(
      private callback: (entries: unknown[]) => void,
      options: IntersectionHandle['options'],
    ) {
      handle = {
        options,
        disconnected: false,
        fire: (entry) => this.callback([{ isIntersecting: entry.intersectionRatio > 0, ...entry }]),
      }
    }
    observe() {}
    unobserve() {}
    disconnect() {
      if (handle) handle.disconnected = true
    }
  }
  class Entry {}
  if (v2) Object.defineProperty(Entry.prototype, 'isVisible', { get: () => false })
  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('IntersectionObserverEntry', Entry)
  return {
    current: () => {
      if (!handle) throw new Error('no IntersectionObserver was created')
      return handle
    },
  }
}

export function installResize(): { fire(height: number): void } {
  let callback: (entries: unknown[]) => void = () => undefined
  class Observer {
    constructor(cb: (entries: unknown[]) => void) {
      callback = cb
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer)
  return { fire: (height) => callback([{ contentRect: { height } }]) }
}

export function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

export function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

// Plays the frame for a unit's iframe: takes the port the loader hands over on `load`, answers
// `ready`, and keeps what the loader sends. `say` sends a frame message to the loader.
export type FakeFrame = {
  port: MessagePort
  received: Array<Record<string, unknown>>
  say(message: Record<string, unknown>): void
  ready(): Promise<void>
}

export function connectFrame(iframe: HTMLIFrameElement): FakeFrame {
  const post = vi.spyOn(iframe.contentWindow as Window, 'postMessage')
  iframe.dispatchEvent(new Event('load'))
  const call = post.mock.calls[post.mock.calls.length - 1] as unknown as [
    unknown,
    string,
    MessagePort[],
  ]
  const port = call[2][0] as MessagePort
  const received: Array<Record<string, unknown>> = []
  port.onmessage = (event) => received.push(event.data as Record<string, unknown>)
  const say = (message: Record<string, unknown>) => port.postMessage({ v: 1, ...message })
  return {
    port,
    received,
    say,
    async ready() {
      say({ type: 'ready' })
      await vi.waitFor(() => expect(received.some((m) => m['type'] === 'start')).toBe(true))
    },
  }
}

// jsdom has no `showModal`, and a modal sits in a closed shadow root a test cannot query: these
// stand in. `showModal` opens the dialog, takes focus from the page as a browser does, and logs
// itself; a message `start` sent to a frame is logged too, so a test sees the order.
export type DialogHandle = {
  order: string[]
  roots: ShadowRoot[]
  /** The container the kernel appended to the body, or null. */
  container(): HTMLElement | null
  dialog(): HTMLDialogElement | null
  iframe(): HTMLIFrameElement
  restore(): void
}

export function installDialog(): DialogHandle {
  const order: string[] = []
  const roots: ShadowRoot[] = []
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>
  const hadShowModal = 'showModal' in proto
  const hadClose = 'close' in proto
  Object.defineProperty(proto, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '')
      order.push('showModal')
      ;(document.activeElement as HTMLElement | null)?.blur()
    },
  })
  Object.defineProperty(proto, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open')
    },
  })
  const attach = Element.prototype.attachShadow
  const attachSpy = vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
    this: Element,
    init: ShadowRootInit,
  ) {
    const root = attach.call(this, init)
    roots.push(root)
    return root
  })
  const port = Object.getPrototypeOf(new MessageChannel().port1) as MessagePort
  const post = port.postMessage
  const postSpy = vi.spyOn(port, 'postMessage').mockImplementation(function (
    this: MessagePort,
    ...args: Parameters<MessagePort['postMessage']>
  ) {
    const message = args[0] as { type?: string } | undefined
    if (message?.type === 'start') order.push('start')
    return post.apply(this, args)
  } as MessagePort['postMessage'])
  const last = () => roots[roots.length - 1]
  return {
    order,
    roots,
    container: () => (last()?.host as HTMLElement | undefined) ?? null,
    dialog: () => last()?.querySelector('dialog') ?? null,
    iframe: () => last()?.querySelector('iframe') as HTMLIFrameElement,
    restore() {
      attachSpy.mockRestore()
      postSpy.mockRestore()
      if (!hadShowModal) delete proto['showModal']
      if (!hadClose) delete proto['close']
    },
  }
}
