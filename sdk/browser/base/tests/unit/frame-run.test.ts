import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runFrame, type FrameContext, type FrameModule } from '../../src/frame'
import { HANDSHAKE_KIND, PROTOCOL_VERSION } from '../../src/protocol'

import { installResize, setViewport, setVisibility } from './helpers'

const v = PROTOCOL_VERSION
const root = document.documentElement
const MARKER = 'tok_SECRET_marker_9f3'

// Plays the loader: sends the handshake from the parent (the window itself in jsdom) and keeps
// the loader's end of the channel.
function handshake() {
  const channel = new MessageChannel()
  const received: Array<Record<string, unknown>> = []
  channel.port1.onmessage = (event) => received.push(event.data as Record<string, unknown>)
  const event = new MessageEvent('message', {
    data: { kind: HANDSHAKE_KIND, v },
    origin: 'https://host.example.test',
    source: window,
  })
  Object.defineProperty(event, 'ports', { value: [channel.port2] })
  window.dispatchEvent(event)
  const say = (message: Record<string, unknown>) => channel.port1.postMessage({ v, ...message })
  const start = (extra: Record<string, unknown> = {}) =>
    say({
      type: 'start',
      props: { a: 1 },
      consent: 'denied',
      theme: { scheme: 'dark' },
      display: 'inline',
      ...extra,
    })
  return { port: channel.port1, received, say, start }
}

const types = (received: Array<Record<string, unknown>>) => received.map((m) => m['type'])

const probe = (
  name = 'unit',
  body: (ctx: FrameContext) => ReturnType<FrameModule['start']> = () => undefined,
) => {
  const start = vi.fn()
  const module: FrameModule = {
    name,
    start(ctx) {
      start(ctx)
      return body(ctx)
    },
  }
  const ctx = (): FrameContext => start.mock.calls[0]?.[0]
  return { module, start, ctx }
}

let stop: () => void = () => undefined
const address = (query: string) => window.history.replaceState({}, '', `/api/sdk/frame/v1?${query}`)

beforeEach(() => {
  address('k=pk_a&scheme=dark&accent=%230a0&m=unit')
  document.body.replaceChildren()
  root.removeAttribute('style')
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  setVisibility('visible')
  setViewport(1024, 768)
})

describe('frame document', () => {
  it('declares the color scheme and the theme of its address, through the CSSOM and sets no margin', () => {
    const attributes = vi.spyOn(Element.prototype, 'setAttribute')
    stop = runFrame({ win: window, modules: [] }).stop
    expect(root.style.getPropertyValue('color-scheme')).toBe('dark')
    expect(root.style.getPropertyValue('--sdk-accent')).toBe('#0a0')
    // The margin is the frame stylesheet's (base.css), not a call of the script.
    expect(root.style.getPropertyValue('margin')).toBe('')
    expect(document.body.style.getPropertyValue('margin')).toBe('')
    expect(attributes.mock.calls.map((call) => call[0])).not.toContain('style')
  })

  it('declares a light scheme when the address names none', () => {
    address('k=pk_a')
    stop = runFrame({ win: window, modules: [] }).stop
    expect(root.style.getPropertyValue('color-scheme')).toBe('light')
  })

  it('reports the height of html over the channel once the module has drawn', async () => {
    const resize = installResize()
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'ready' }))
    start()
    await vi.waitFor(() => expect(types(received)).toContain('rendered'))
    resize.fire(240)
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'size', height: 240 }))
  })

  it('reports no size before the module has drawn, then the first size before rendered', async () => {
    const resize = installResize()
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ height: 77.2 } as DOMRect)
    let finish: () => void = () => undefined
    const unit = probe('unit', () => new Promise<void>((resolve) => (finish = resolve)))
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    resize.fire(30)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(types(received)).not.toContain('size')
    finish()
    await vi.waitFor(() => expect(types(received)).toContain('rendered'))
    expect(received.filter((m) => m['type'] === 'size' || m['type'] === 'rendered')).toEqual([
      { v, type: 'size', height: 78 },
      { v, type: 'rendered' },
    ])
    vi.restoreAllMocks()
  })

  it('reports no size at all for a module that fails', async () => {
    const resize = installResize()
    const unit = probe('unit', () => Promise.reject(new Error('x')))
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start()
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'error', code: 'module_failed' }),
    )
    resize.fire(30)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(types(received)).not.toContain('size')
  })
})

describe('start', () => {
  it('starts no module before the handshake and the start message', async () => {
    const { module, start } = probe()
    stop = runFrame({ win: window, modules: [module] }).stop
    expect(start).not.toHaveBeenCalled()
    const { received, start: sendStart } = handshake()
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'ready' }))
    expect(start).not.toHaveBeenCalled()
    sendStart()
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1))
  })

  it('starts only the module the address names, with a mount, its props and display', async () => {
    const unit = probe('unit')
    const other = probe('other')
    stop = runFrame({ win: window, modules: [other.module, unit.module] }).stop
    handshake().start({ props: { text: 'hi' }, display: 'modal' })
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalledTimes(1))
    expect(other.start).not.toHaveBeenCalled()
    const ctx = unit.ctx()
    expect(ctx.mount.parentElement).toBe(document.body)
    expect(ctx.mount.getAttribute('data-module')).toBe('unit')
    expect(ctx.display).toBe('modal')
    expect(ctx.props()).toEqual({ text: 'hi' })
  })

  it('applies the theme of the start message, and the consent', async () => {
    const unit = probe()
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 204 }))
    stop = runFrame({
      win: window,
      modules: [unit.module],
      fetch: fetchImpl as unknown as typeof fetch,
    }).stop
    handshake().start({ consent: 'granted', theme: { scheme: 'light', accent: '#123456' } })
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    expect(root.style.getPropertyValue('color-scheme')).toBe('light')
    expect(root.style.getPropertyValue('--sdk-accent')).toBe('#123456')
    unit.ctx().track({ n: 1 })
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('ignores a second start', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { start } = handshake()
    start()
    start({ props: { a: 2 } })
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(unit.start).toHaveBeenCalledTimes(1)
    expect(unit.ctx().props()).toEqual({ a: 1 })
  })

  it('sends unknown_module and starts nothing for a name that is not served', async () => {
    address('k=pk_a&m=missing')
    const unit = probe('unit')
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start()
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'error', code: 'unknown_module' }),
    )
    expect(unit.start).not.toHaveBeenCalled()
  })

  it('sends unknown_module when the address names no module', async () => {
    address('k=pk_a')
    const unit = probe('unit')
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start()
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'error', code: 'unknown_module' }),
    )
    expect(unit.start).not.toHaveBeenCalled()
  })

  it.each([
    ['bad_props', 'text'],
    ['bad_props', [1]],
    ['bad_props', null],
    ['props_too_large', { a: 'x'.repeat(9000) }],
  ])('sends %s and starts nothing for props that are not a small object', async (code, props) => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start({ props })
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'error', code }))
    expect(unit.start).not.toHaveBeenCalled()
    expect(types(received)).not.toContain('rendered')
  })

  it('ignores a message of another protocol version', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { port } = handshake()
    port.postMessage({
      v: 99,
      type: 'start',
      props: {},
      consent: 'denied',
      theme: {},
      display: 'inline',
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(unit.start).not.toHaveBeenCalled()
  })
})

describe('rendered and failure', () => {
  it('sends rendered when start returns', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start()
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'rendered' }))
  })

  it('sends rendered when the promise of start resolves, not before', async () => {
    let finish: () => void = () => undefined
    const unit = probe('unit', () => new Promise<void>((resolve) => (finish = resolve)))
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(types(received)).not.toContain('rendered')
    finish()
    await vi.waitFor(() => expect(types(received)).toContain('rendered'))
  })

  it('sends module_failed, never the text, when start throws', async () => {
    const unit = probe('unit', () => {
      throw new Error(`unit ${MARKER} expired`)
    })
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start()
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'error', code: 'module_failed' }),
    )
    expect(types(received)).not.toContain('rendered')
    expect(JSON.stringify(received)).not.toContain(MARKER)
  })

  it('sends module_failed when the promise of start rejects', async () => {
    const unit = probe('unit', () => Promise.reject(new Error(MARKER)))
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received, start } = handshake()
    start()
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'error', code: 'module_failed' }),
    )
    expect(types(received)).not.toContain('rendered')
    expect(JSON.stringify(received)).not.toContain(MARKER)
  })
})

describe('end of a unit', () => {
  it('ignores a destroy message: the frame is ended by its iframe, not by a message', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { say, start, received } = handshake()
    start()
    await vi.waitFor(() => expect(types(received)).toContain('rendered'))
    say({ type: 'destroy' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(document.body.children).toHaveLength(1)
  })

  it('never calls a function start returns: there is no cleanup', async () => {
    const cleanup = vi.fn()
    const unit = probe('unit', () => cleanup as never)
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { start, received } = handshake()
    start()
    await vi.waitFor(() => expect(types(received)).toContain('rendered'))
    stop()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('flushes the telemetry buffer when the frame stops, and sends none before consent', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const unit = probe()
    const run = runFrame({
      win: window,
      modules: [unit.module],
      fetch: fetchImpl as unknown as typeof fetch,
    })
    stop = run.stop
    const { start, received } = handshake()
    start({ consent: 'granted' })
    await vi.waitFor(() => expect(types(received)).toContain('rendered'))
    unit.ctx().track({ n: 1 })
    expect(fetchImpl).not.toHaveBeenCalled()
    run.stop()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${window.location.origin}/api/sdk/v1/telemetry`)
    expect(JSON.parse(init.body as string)).toEqual({ events: [{ n: 1 }] })
  })
})

describe('display', () => {
  beforeEach(() => root.removeAttribute('data-display'))

  it.each(['inline', 'modal'])(
    'sets data-display=%s on the root before the module starts',
    async (display) => {
      let seen: string | null = 'unset'
      const unit = probe('unit', () => {
        seen = root.getAttribute('data-display')
      })
      stop = runFrame({ win: window, modules: [unit.module] }).stop
      const { start } = handshake()
      start({ display })
      await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
      expect(seen).toBe(display)
    },
  )

  const escape = (target: EventTarget = document.body) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
  const modalFrame = async (body?: (ctx: FrameContext) => void, display = 'modal') => {
    const unit = probe('unit', body)
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const frame = handshake()
    frame.start({ display })
    await vi.waitFor(() => expect(types(frame.received)).toContain('rendered'))
    return { ...frame, unit }
  }

  it('asks to close on Escape in a modal', async () => {
    const { received } = await modalFrame()
    escape()
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'close' }))
  })

  it('asks for nothing on another key, nor on Escape in an inline unit', async () => {
    const modal = await modalFrame()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(types(modal.received)).not.toContain('close')
    stop()
    document.body.replaceChildren()
    const inline = await modalFrame(undefined, 'inline')
    escape()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(types(inline.received)).not.toContain('close')
  })

  it('leaves an Escape that the module prevented alone', async () => {
    const { received, unit } = await modalFrame((ctx) =>
      ctx.mount.addEventListener('keydown', (event) => event.preventDefault()),
    )
    escape(unit.ctx().mount)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(types(received)).not.toContain('close')
  })

  it('focuses the mount of a modal when nothing in it has focus, and makes it focusable', async () => {
    const { unit } = await modalFrame()
    const { mount } = unit.ctx()
    expect(mount.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(mount)
  })

  it('focuses the first [autofocus] element of a modal instead', async () => {
    let field: HTMLElement | undefined
    const { unit } = await modalFrame((ctx) => {
      for (const attribute of ['', 'autofocus']) {
        const input = ctx.mount.ownerDocument.createElement('input')
        if (attribute) input.setAttribute('autofocus', '')
        ctx.mount.appendChild(input)
        if (attribute) field = input
      }
    })
    expect(document.activeElement).toBe(field)
    expect(unit.ctx().mount.hasAttribute('tabindex')).toBe(false)
  })

  it('leaves the focus alone when the module put it somewhere in the mount', async () => {
    let chosen: HTMLElement | undefined
    const { unit } = await modalFrame((ctx) => {
      const doc = ctx.mount.ownerDocument
      const auto = ctx.mount.appendChild(doc.createElement('input'))
      auto.setAttribute('autofocus', '')
      chosen = ctx.mount.appendChild(doc.createElement('input'))
      chosen.focus()
    })
    expect(document.activeElement).toBe(chosen)
    expect(unit.ctx().mount.hasAttribute('tabindex')).toBe(false)
  })

  it('tries again on a later frame when the engine ignored the first focus, and then stops', async () => {
    let calls = 0
    let field: HTMLElement | undefined
    await modalFrame((ctx) => {
      field = ctx.mount.ownerDocument.createElement('input')
      field.setAttribute('autofocus', '')
      // WebKit, soon after the host showed the dialog: the first call does nothing.
      field.focus = function (this: HTMLElement) {
        calls += 1
        if (calls > 1) HTMLElement.prototype.focus.call(this)
      }
      ctx.mount.appendChild(field)
    })
    await vi.waitFor(() => expect(document.activeElement).toBe(field))
    expect(calls).toBe(2)
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(calls).toBe(2)
  })

  it('takes no focus for an inline unit', async () => {
    const { unit } = await modalFrame(undefined, 'inline')
    expect(document.activeElement).toBe(document.body)
    expect(unit.ctx().mount.hasAttribute('tabindex')).toBe(false)
  })
})

describe('props', () => {
  it('replace the current props and call every onProps handler', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { say, start } = handshake()
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    const first = vi.fn()
    const second = vi.fn()
    unit.ctx().onProps(first)
    unit.ctx().onProps(second)
    say({ type: 'props', props: { a: 2 } })
    await vi.waitFor(() => expect(first).toHaveBeenCalledWith({ a: 2 }))
    expect(second).toHaveBeenCalledWith({ a: 2 })
    expect(unit.ctx().props()).toEqual({ a: 2 })
  })

  it('send module_failed when a handler throws, and still call the next', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { say, start, received } = handshake()
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    const after = vi.fn()
    unit.ctx().onProps(() => {
      throw new Error(MARKER)
    })
    unit.ctx().onProps(after)
    say({ type: 'props', props: { a: 2 } })
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'error', code: 'module_failed' }),
    )
    expect(after).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(received)).not.toContain(MARKER)
  })

  it('that are not a small object send an error and leave the current props', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { say, start, received } = handshake()
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    const handler = vi.fn()
    unit.ctx().onProps(handler)
    say({ type: 'props', props: [1] })
    say({ type: 'props', props: { a: 'x'.repeat(9000) } })
    await vi.waitFor(() => expect(received.filter((m) => m['type'] === 'error')).toHaveLength(2))
    expect(received).toContainEqual({ v, type: 'error', code: 'bad_props' })
    expect(received).toContainEqual({ v, type: 'error', code: 'props_too_large' })
    expect(handler).not.toHaveBeenCalled()
    expect(unit.ctx().props()).toEqual({ a: 1 })
  })

  it('before start are ignored', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { say, start, received } = handshake()
    say({ type: 'props', props: { a: 9 } })
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    expect(unit.ctx().props()).toEqual({ a: 1 })
    expect(types(received)).not.toContain('error')
  })
})

describe('what a module sends the host', () => {
  it('emit sends the name and the data, and close asks the host to close', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { start, received } = handshake()
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    unit.ctx().emit('seen', { ratio: 1 })
    unit.ctx().emit('plain')
    unit.ctx().close()
    await vi.waitFor(() => expect(types(received)).toContain('close'))
    expect(received).toContainEqual({ v, type: 'emit', name: 'seen', data: { ratio: 1 } })
    expect(received).toContainEqual({ v, type: 'emit', name: 'plain' })
  })

  it('emit drops a bad name, data that is not JSON and data over the cap, and never throws', async () => {
    const unit = probe()
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { start, received } = handshake()
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    const cycle: Record<string, unknown> = {}
    cycle['self'] = cycle
    const ctx = unit.ctx()
    expect(() => {
      ctx.emit('Bad Name')
      ctx.emit('', 1)
      ctx.emit('seen', cycle)
      ctx.emit('seen', () => 1)
      ctx.emit('seen', 'x'.repeat(9000))
      ctx.emit('seen', 1n)
    }).not.toThrow()
    ctx.emit('last')
    await vi.waitFor(() => expect(received.some((m) => m['name'] === 'last')).toBe(true))
    expect(received.filter((m) => m['type'] === 'emit')).toHaveLength(1)
  })

  it('request works before consent, and track waits for it', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"a":1}', { status: 200 }))
    const unit = probe()
    stop = runFrame({
      win: window,
      modules: [unit.module],
      fetch: fetchImpl as unknown as typeof fetch,
    }).stop
    handshake().start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    await expect(unit.ctx().request('/api/sdk/v1/thing')).resolves.toEqual({ a: 1 })
    unit.ctx().track({ n: 1 })
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('theme and consent after start', () => {
  it('are taken from the host', async () => {
    const unit = probe()
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }))
    stop = runFrame({
      win: window,
      modules: [unit.module],
      fetch: fetchImpl as unknown as typeof fetch,
    }).stop
    const { say, start } = handshake()
    start()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    say({ type: 'theme', theme: { scheme: 'light', accent: '#123456' } })
    say({ type: 'consent', state: 'granted' })
    say({ v: 99, type: 'consent', state: 'denied' })
    await vi.waitFor(() => expect(root.style.getPropertyValue('--sdk-accent')).toBe('#123456'))
    expect(root.style.getPropertyValue('color-scheme')).toBe('light')
    unit.ctx().track({ n: 1 })
    window.dispatchEvent(new Event('pagehide'))
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
  })
})

describe('the ack of a consent message', () => {
  it('answers each consent message with an ack of the state it took, after taking it', async () => {
    const unit = probe()
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }))
    stop = runFrame({
      win: window,
      modules: [unit.module],
      fetch: fetchImpl as unknown as typeof fetch,
    }).stop
    const { say, start, received } = handshake()
    start({ consent: 'granted' })
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    unit.ctx().track({ n: 1 })
    say({ type: 'consent', state: 'denied' })
    await vi.waitFor(() => expect(received.filter((m) => m['type'] === 'ack')).toHaveLength(1))
    expect(received.find((m) => m['type'] === 'ack')).toEqual({ v, type: 'ack', state: 'denied' })
    // The ack came after the frame took the state: the buffer is dropped, not sent.
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchImpl).not.toHaveBeenCalled()
    say({ type: 'consent', state: 'granted' })
    await vi.waitFor(() => expect(received.filter((m) => m['type'] === 'ack')).toHaveLength(2))
    expect(received.filter((m) => m['type'] === 'ack').map((m) => m['state'])).toEqual([
      'denied',
      'granted',
    ])
  })
})
