import { afterEach, describe, expect, it, vi } from 'vitest'

import { HANDSHAKE_KIND, PROTOCOL_VERSION } from '../../src/protocol'
import {
  SANDBOX,
  createUnitFrame,
  mountInline,
  mountModal,
  type UnitFrameOptions,
} from '../../src/ui'

import { installDialog } from './helpers'

const ORIGIN = 'https://api.example.test'
const v = PROTOCOL_VERSION

const options = (extra: Partial<UnitFrameOptions> = {}): UnitFrameOptions => ({
  doc: document,
  apiOrigin: ORIGIN,
  key: 'pk_a',
  module: 'unit',
  title: 'A unit',
  major: 1,
  theme: { scheme: 'dark', accent: '#0a0' },
  handshakeTimeoutMs: 1000,
  onReady: vi.fn(),
  onMessage: vi.fn(),
  onTimeout: vi.fn(),
  ...extra,
})

// The frame as the loader holds it, put inline on a page.
const make = (extra: Partial<UnitFrameOptions> = {}, placeholderHeight = 120) => {
  const opts = options(extra)
  const frame = createUnitFrame(opts)
  const target = document.body.appendChild(document.createElement('div'))
  const inline = mountInline({ target, iframe: frame.iframe, placeholderHeight })
  const post = vi.spyOn(frame.iframe.contentWindow as Window, 'postMessage')
  return { frame, inline, target, post, opts }
}

const loadFrame = (iframe: HTMLIFrameElement) => iframe.dispatchEvent(new Event('load'))
const portOf = (post: ReturnType<typeof vi.spyOn>, call = 0) =>
  ((post.mock.calls[call] as unknown[])[2] as MessagePort[])[0] as MessagePort

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('unit frame', () => {
  it('titles the iframe with the module title and names the module in the address', () => {
    const { frame } = make()
    expect(frame.iframe.getAttribute('title')).toBe('A unit')
    const src = new URL(frame.iframe.getAttribute('src') as string)
    expect(src.origin).toBe(ORIGIN)
    expect(src.pathname).toBe('/api/sdk/frame/v1')
    expect(src.searchParams.get('k')).toBe('pk_a')
    expect(src.searchParams.get('m')).toBe('unit')
    expect(src.searchParams.get('scheme')).toBe('dark')
    expect(src.searchParams.get('accent')).toBe('#0a0')
  })

  it('is sandboxed without top navigation', () => {
    const { frame } = make()
    expect(frame.iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms',
    )
    expect(frame.iframe.getAttribute('sandbox')).not.toContain('top-navigation')
  })

  it.each([
    ['an empty title', { title: ' ' }],
    ['no module name', { module: '' }],
    ['a module name that is not a name', { module: 'Not A Name' }],
  ])('refuses %s and creates nothing', (_name, extra) => {
    expect(() => createUnitFrame(options(extra))).toThrow()
  })

  it('opens the handshake to the exact origin of the frame, on every load', () => {
    const { frame, post } = make()
    loadFrame(frame.iframe)
    expect(post).toHaveBeenCalledTimes(1)
    const [message, targetOrigin, transfer] = post.mock.calls[0] as unknown as [
      unknown,
      string,
      unknown[],
    ]
    expect(message).toEqual({ kind: HANDSHAKE_KIND, v })
    expect(targetOrigin).toBe(ORIGIN)
    expect(transfer).toHaveLength(1)
    expect(transfer[0]).toBeInstanceOf(MessagePort)

    loadFrame(frame.iframe)
    expect(post).toHaveBeenCalledTimes(2)
    expect(portOf(post, 1)).not.toBe(portOf(post, 0))
  })

  it('says ready once the frame answers, and passes its messages on, not a malformed one', async () => {
    const { frame, post, opts } = make()
    loadFrame(frame.iframe)
    const port = portOf(post)
    port.postMessage({ v, type: 'ready' })
    await vi.waitFor(() => expect(opts.onReady).toHaveBeenCalledTimes(1))
    port.postMessage({ v, type: 'bogus' })
    port.postMessage('text')
    port.postMessage({ v, type: 'rendered' })
    port.postMessage({ v, type: 'emit', name: 'seen', data: 1 })
    await vi.waitFor(() => expect(opts.onMessage).toHaveBeenCalledTimes(2))
    expect(opts.onMessage).toHaveBeenNthCalledWith(1, { v, type: 'rendered' })
    expect(opts.onMessage).toHaveBeenNthCalledWith(2, { v, type: 'emit', name: 'seen', data: 1 })
  })

  it('times out when no answer comes, and does not read the load event as an answer', () => {
    vi.useFakeTimers()
    const { frame, opts } = make()
    loadFrame(frame.iframe)
    vi.advanceTimersByTime(999)
    expect(opts.onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(opts.onTimeout).toHaveBeenCalledTimes(1)
    expect(opts.onReady).not.toHaveBeenCalled()
  })

  it('starts the handshake timer at load: a slow load is not a timeout', () => {
    vi.useFakeTimers()
    const { frame, opts } = make()
    vi.advanceTimersByTime(3000)
    expect(opts.onTimeout).not.toHaveBeenCalled()
    loadFrame(frame.iframe)
    vi.advanceTimersByTime(999)
    expect(opts.onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(opts.onTimeout).toHaveBeenCalledTimes(1)
  })

  it('ends a frame that never loads at a second, longer cap, once', () => {
    vi.useFakeTimers()
    const { opts } = make({ loadTimeoutMs: 5000 })
    vi.advanceTimersByTime(4999)
    expect(opts.onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(opts.onTimeout).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    expect(opts.onTimeout).toHaveBeenCalledTimes(1)
  })

  it('has a load cap of 20 seconds by default', () => {
    vi.useFakeTimers()
    const opts = options()
    delete opts.handshakeTimeoutMs
    createUnitFrame(opts)
    vi.advanceTimersByTime(19_999)
    expect(opts.onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(opts.onTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not let the load cap end a frame that loaded and answered', async () => {
    vi.useFakeTimers()
    const { frame, post, opts } = make({ loadTimeoutMs: 5000 })
    loadFrame(frame.iframe)
    portOf(post).postMessage({ v, type: 'ready' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(opts.onReady).toHaveBeenCalledTimes(1)
    expect(opts.onTimeout).not.toHaveBeenCalled()
  })

  it('reports a frame that loaded but never answered once, not again at the load cap', () => {
    vi.useFakeTimers()
    const { frame, opts } = make({ loadTimeoutMs: 5000 })
    loadFrame(frame.iframe)
    vi.advanceTimersByTime(60_000)
    expect(opts.onTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not time out when the frame answers in time', async () => {
    const { frame, post, opts } = make({ handshakeTimeoutMs: 50 })
    loadFrame(frame.iframe)
    portOf(post).postMessage({ v, type: 'ready' })
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(opts.onTimeout).not.toHaveBeenCalled()
  })

  it('is inert once disposed: no handshake on a later load, no timer, no ready', async () => {
    vi.useFakeTimers()
    const { frame, post, opts } = make()
    loadFrame(frame.iframe)
    const port = portOf(post)
    frame.dispose()
    loadFrame(frame.iframe)
    expect(post).toHaveBeenCalledTimes(1)
    port.postMessage({ v, type: 'ready' })
    port.postMessage({ v, type: 'rendered' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(opts.onReady).not.toHaveBeenCalled()
    expect(opts.onMessage).not.toHaveBeenCalled()
    expect(opts.onTimeout).not.toHaveBeenCalled()
  })

  it('removes its load listener and both timers on dispose', () => {
    vi.useFakeTimers()
    const { frame, opts } = make()
    const remove = vi.spyOn(frame.iframe, 'removeEventListener')
    frame.dispose()
    expect(remove.mock.calls.map((call) => call[0])).toEqual(['load'])
    vi.advanceTimersByTime(60_000)
    expect(opts.onTimeout).not.toHaveBeenCalled()
  })

  it('allows forms in the sandbox and never top navigation', () => {
    expect(SANDBOX.split(' ')).toEqual([
      'allow-scripts',
      'allow-same-origin',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-forms',
    ])
    expect(SANDBOX).not.toContain('top-navigation')
    const { frame } = make()
    expect(frame.iframe.getAttribute('sandbox')).toBe(SANDBOX)
  })

  it('sets the color scheme of the theme on the iframe element', () => {
    const { frame } = make()
    expect(frame.iframe.style.getPropertyValue('color-scheme')).toBe('dark')
  })

  it('sets a light scheme when the theme names none', () => {
    const { frame } = make({ theme: {} })
    expect(frame.iframe.style.getPropertyValue('color-scheme')).toBe('light')
  })

  it('follows a theme sent later, also before the channel is open', () => {
    const { frame } = make()
    frame.send({ type: 'theme', theme: { scheme: 'light' } })
    expect(frame.iframe.style.getPropertyValue('color-scheme')).toBe('light')
    frame.send({ type: 'theme', theme: {} })
    expect(frame.iframe.style.getPropertyValue('color-scheme')).toBe('light')
    frame.send({ type: 'theme', theme: { scheme: 'dark' } })
    expect(frame.iframe.style.getPropertyValue('color-scheme')).toBe('dark')
  })

  it('sends a message over the channel', async () => {
    const { frame, post } = make()
    loadFrame(frame.iframe)
    const port = portOf(post)
    const received: unknown[] = []
    port.onmessage = (event) => received.push(event.data)
    frame.send({ type: 'theme', theme: { scheme: 'light' } })
    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0]).toEqual({ v, type: 'theme', theme: { scheme: 'light' } })
  })

  it('drops a message sent before the channel is open', () => {
    const { frame } = make()
    expect(() => frame.send({ type: 'consent', state: 'granted' })).not.toThrow()
  })

  it('sends nothing when it is disposed, and stops the timer', () => {
    vi.useFakeTimers()
    const { frame, inline, target, post, opts } = make()
    const Original = MessageChannel
    const sent: unknown[] = []
    vi.stubGlobal(
      'MessageChannel',
      class extends Original {
        constructor() {
          super()
          const postMessage = this.port1.postMessage.bind(this.port1)
          this.port1.postMessage = (message: unknown) => {
            sent.push(message)
            postMessage(message)
          }
        }
      },
    )
    post.mockImplementation(() => undefined)
    loadFrame(frame.iframe)
    frame.dispose()
    inline.remove()
    expect(sent).toEqual([])
    expect(target.children).toHaveLength(0)
    vi.advanceTimersByTime(5000)
    expect(opts.onTimeout).not.toHaveBeenCalled()
  })
})

describe('inline mount', () => {
  // A browser found this: an iframe put in the page without an address fires `load` for its empty
  // document first (WebKit), and the handshake sent to it was refused with a console error.
  it('puts the iframe in the page with its sandbox and address already set', () => {
    const frame = createUnitFrame(options())
    const target = document.body.appendChild(document.createElement('div'))
    const attributes: Array<[string | null, string | null]> = []
    vi.spyOn(target, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      const found = (node as unknown as Element).querySelector('iframe')
      attributes.push([found?.getAttribute('sandbox') ?? null, found?.getAttribute('src') ?? null])
      return Node.prototype.appendChild.call(target, node) as T
    })
    mountInline({ target, iframe: frame.iframe })
    expect(attributes).toHaveLength(1)
    expect(attributes[0]?.[0]).toContain('allow-scripts')
    expect(attributes[0]?.[1]).toContain('/api/sdk/frame/v1')
  })

  it('adds one container with one iframe, and holds the placeholder height', () => {
    const { target, frame } = make()
    expect(target.children).toHaveLength(1)
    expect(target.firstElementChild?.children).toHaveLength(1)
    expect(frame.iframe.style.getPropertyValue('height')).toBe('120px')
    expect((target.firstElementChild as HTMLElement).style.getPropertyValue('height')).toBe('120px')
  })

  it('holds 100px when the declaration gives no placeholder', () => {
    const frame = createUnitFrame(options())
    const target = document.body.appendChild(document.createElement('div'))
    mountInline({ target, iframe: frame.iframe })
    expect(frame.iframe.style.getPropertyValue('height')).toBe('100px')
  })

  it('never writes a style attribute: it uses the CSSOM', () => {
    const attributes = vi.spyOn(Element.prototype, 'setAttribute')
    make()
    expect(attributes.mock.calls.map((call) => call[0])).not.toContain('style')
  })

  it('sets the height the frame reports on the container and the iframe', () => {
    const { inline, frame, target } = make()
    inline.setHeight(188)
    expect(frame.iframe.style.getPropertyValue('height')).toBe('188px')
    expect((target.firstElementChild as HTMLElement).style.getPropertyValue('height')).toBe('188px')
  })

  it('is undone by remove', () => {
    const { inline, target } = make()
    inline.remove()
    expect(target.children).toHaveLength(0)
  })
})

describe('modal mount', () => {
  let page: ReturnType<typeof installDialog>
  afterEach(() => {
    page.restore()
    document.documentElement.style.removeProperty('overflow')
  })

  const make = (opener: Element | null = null) => {
    page = installDialog()
    const frame = createUnitFrame(options({ title: 'Dialog title' }))
    const onCancel = vi.fn()
    const onDetached = vi.fn()
    const modal = mountModal({
      doc: document,
      iframe: frame.iframe,
      title: 'Dialog title',
      opener,
      onCancel,
      onDetached,
    })
    return { frame, modal, onCancel, onDetached }
  }

  it('puts a closed container on the body: a closed shadow root, a labelled dialog, the iframe', () => {
    const { frame } = make()
    const container = page.container() as HTMLElement
    expect(container.parentElement).toBe(document.body)
    expect(container.shadowRoot).toBeNull()
    expect(page.roots[0]?.mode).toBe('closed')
    const dialog = page.dialog() as HTMLDialogElement
    expect(dialog.getAttribute('aria-label')).toBe('Dialog title')
    expect(dialog.hasAttribute('open')).toBe(false)
    expect(frame.iframe.parentElement).toBe(dialog)
  })

  it('fills the viewport through the CSSOM, and writes no style attribute', () => {
    const attributes = vi.spyOn(Element.prototype, 'setAttribute')
    const { frame } = make()
    expect(attributes.mock.calls.map((call) => call[0])).not.toContain('style')
    const dialog = page.dialog() as HTMLDialogElement
    for (const [name, value] of [
      ['margin', '0px'],
      ['padding', '0px'],
      ['max-width', 'none'],
      ['max-height', 'none'],
      ['width', '100%'],
      ['height', '100%'],
    ] as const) {
      expect([name, dialog.style.getPropertyValue(name)]).toEqual([name, value])
    }
    expect(dialog.style.getPropertyValue('border-width')).toBe('0px')
    expect(dialog.style.getPropertyValue('background')).toMatch(/^(transparent|none)/)
    expect(frame.iframe.style.getPropertyValue('width')).toBe('100%')
    expect(frame.iframe.style.getPropertyValue('height')).toBe('100%')
  })

  it('adopts one sheet on the root that clears the backdrop', () => {
    make()
    const sheets = (page.roots[0] as ShadowRoot).adoptedStyleSheets
    expect(sheets).toHaveLength(1)
    const text = Array.from(sheets[0]?.cssRules ?? [])
      .map((rule) => rule.cssText)
      .join(' ')
    expect(text).toMatch(/dialog::backdrop \{ background: (transparent|none)/)
  })

  it('shows the dialog once, locks the page scroll and focuses the iframe', () => {
    const { frame, modal } = make()
    const focus = vi.spyOn(frame.iframe, 'focus')
    modal.show()
    modal.show()
    expect(page.order).toEqual(['showModal'])
    expect(focus).toHaveBeenCalledTimes(1)
    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('hidden')
  })

  it('removes the container, and puts the scroll and the focus back, when it was shown', () => {
    const opener = document.body.appendChild(document.createElement('button'))
    opener.focus()
    const { modal } = make(opener)
    document.documentElement.style.setProperty('overflow', 'auto', 'important')
    modal.show()
    modal.remove()
    expect(page.container()?.isConnected).toBe(false)
    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('auto')
    expect(document.documentElement.style.getPropertyPriority('overflow')).toBe('important')
    expect(document.activeElement).toBe(opener)
  })

  it('removes only the container when it was never shown', () => {
    const opener = document.body.appendChild(document.createElement('button'))
    opener.focus()
    const { modal } = make(opener)
    const write = vi.spyOn(document.documentElement.style, 'setProperty')
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    modal.remove()
    expect(page.container()?.isConnected).toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it('puts the scroll back only when the value is still the plain hidden it wrote', () => {
    const html = document.documentElement.style
    const first = make()
    first.modal.show()
    // A second instance on the page: its own frame and dialog, the same stand-ins.
    const second = mountModal({
      doc: document,
      iframe: createUnitFrame(options({ title: 'Other' })).iframe,
      title: 'Other',
      opener: null,
      onCancel: vi.fn(),
      onDetached: vi.fn(),
    })
    second.show()
    // Closed in the order they opened: the page ends with its own value, not with `hidden`.
    first.modal.remove()
    second.remove()
    expect(html.getPropertyValue('overflow')).toBe('')
  })

  it('leaves a value the page set while it was open', () => {
    const html = document.documentElement.style
    const { modal } = make()
    modal.show()
    html.setProperty('overflow', 'auto')
    modal.remove()
    expect(html.getPropertyValue('overflow')).toBe('auto')
    page.restore()
    const again = make()
    again.modal.show()
    html.setProperty('overflow', 'hidden', 'important')
    again.modal.remove()
    expect(html.getPropertyPriority('overflow')).toBe('important')
  })

  it('hide closes the dialog and gives the page back, and leaves the container until remove', () => {
    const opener = document.body.appendChild(document.createElement('button'))
    opener.focus()
    const { modal } = make(opener)
    modal.show()
    expect(document.activeElement).not.toBe(opener)
    modal.hide()
    expect((page.dialog() as HTMLDialogElement).hasAttribute('open')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('')
    expect(document.activeElement).toBe(opener)
    expect(page.container()?.isConnected).toBe(true)
    modal.remove()
    expect(page.container()?.isConnected).toBe(false)
  })

  it('watches the body and the root for the container while shown, and says when it is gone', async () => {
    const watched: Array<{ target: Node; options: MutationObserverInit | undefined }> = []
    const observe = MutationObserver.prototype.observe
    const spy = vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (
      this: MutationObserver,
      target: Node,
      options?: MutationObserverInit,
    ) {
      watched.push({ target, options })
      return observe.call(this, target, options)
    })
    const { modal, onDetached } = make()
    expect(watched).toEqual([])
    modal.show()
    expect(watched.map((one) => one.target)).toEqual([document.body, document.documentElement])
    expect(watched.map((one) => one.options)).toEqual([{ childList: true }, { childList: true }])
    document.body.appendChild(document.createElement('p'))
    await Promise.resolve()
    expect(onDetached).not.toHaveBeenCalled()
    page.container()?.remove()
    await vi.waitFor(() => expect(onDetached).toHaveBeenCalledTimes(1))
    spy.mockRestore()
  })

  it('says nothing after remove: the observer is disconnected', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { modal, onDetached } = make()
    modal.show()
    modal.remove()
    expect(disconnect).toHaveBeenCalled()
    await Promise.resolve()
    expect(onDetached).not.toHaveBeenCalled()
  })

  it('goes to the root element when the page has no body yet, and then shows', () => {
    const body = document.body
    body.remove()
    try {
      const { modal } = make()
      expect(page.container()?.parentElement).toBe(document.documentElement)
      expect(() => modal.show()).not.toThrow()
      modal.remove()
    } finally {
      document.documentElement.appendChild(body)
    }
  })

  it('prevents the cancel of the dialog and asks to close', () => {
    const { onCancel } = make()
    const cancel = new Event('cancel', { cancelable: true })
    ;(page.dialog() as HTMLDialogElement).dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not focus the body or an opener that has left the page', () => {
    const gone = document.body.appendChild(document.createElement('button'))
    const { modal } = make(gone)
    modal.show()
    gone.remove()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    modal.remove()
    expect(focus).not.toHaveBeenCalled()
    page.restore()
    const second = make(document.body)
    second.modal.show()
    focus.mockClear()
    second.modal.remove()
    expect(focus).not.toHaveBeenCalled()
  })
})
