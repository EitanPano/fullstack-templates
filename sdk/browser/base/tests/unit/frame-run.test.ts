import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runFrame, type FrameModule } from '../../src/frame'
import { HANDSHAKE_KIND, PROTOCOL_VERSION } from '../../src/protocol'

import { installIntersection, installResize, setViewport, setVisibility } from './helpers'

const v = PROTOCOL_VERSION
const root = document.documentElement

// Plays the loader: sends the handshake from the parent (the window itself in jsdom) and keeps
// the loader's end of the channel.
function handshake() {
  const channel = new MessageChannel()
  const received: unknown[] = []
  channel.port1.onmessage = (event) => received.push(event.data)
  const event = new MessageEvent('message', {
    data: { kind: HANDSHAKE_KIND, v },
    origin: 'https://host.example.test',
    source: window,
  })
  Object.defineProperty(event, 'ports', { value: [channel.port2] })
  window.dispatchEvent(event)
  return { port: channel.port1, received }
}

const probe = (name = 'probe') => {
  const start = vi.fn()
  const cleanup = vi.fn()
  const module: FrameModule = {
    name,
    start(ctx) {
      start(ctx)
      return cleanup
    },
  }
  return { module, start, cleanup }
}

let stop: () => void = () => undefined

beforeEach(() => {
  window.history.replaceState({}, '', '/api/sdk/frame/v1?k=pk_a&scheme=dark&accent=%230a0')
  document.body.replaceChildren()
  root.removeAttribute('style')
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  setVisibility('visible')
  setViewport(1024, 768)
})

describe('frame', () => {
  it('declares the color scheme and the theme of its address, with no margin, through the CSSOM', () => {
    const attributes = vi.spyOn(Element.prototype, 'setAttribute')
    stop = runFrame({ win: window, modules: [] }).stop
    expect(root.style.getPropertyValue('color-scheme')).toBe('dark')
    expect(root.style.getPropertyValue('--sdk-accent')).toBe('#0a0')
    expect(root.style.getPropertyValue('margin')).toBe('0px')
    expect(document.body.style.getPropertyValue('margin')).toBe('0px')
    expect(attributes.mock.calls.map((call) => call[0])).not.toContain('style')
  })

  it('declares a light scheme when the address names none', () => {
    window.history.replaceState({}, '', '/api/sdk/frame/v1?k=pk_a')
    stop = runFrame({ win: window, modules: [] }).stop
    expect(root.style.getPropertyValue('color-scheme')).toBe('light')
  })

  it('starts no module before a handshake, then answers ready and gives modules a mount', async () => {
    const { module, start } = probe()
    stop = runFrame({ win: window, modules: [module] }).stop
    expect(start).not.toHaveBeenCalled()
    const { received } = handshake()
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'ready' }))
    expect(start).toHaveBeenCalledTimes(1)
    const ctx = start.mock.calls[0]?.[0]
    expect(ctx.key).toBe('pk_a')
    expect(ctx.mount.parentElement).toBe(document.body)
  })

  it('sends what a module reports as events, and its own messages', async () => {
    const { module, start } = probe('unit')
    stop = runFrame({ win: window, modules: [module] }).stop
    const { received } = handshake()
    await vi.waitFor(() => expect(start).toHaveBeenCalled())
    const ctx = start.mock.calls[0]?.[0]
    ctx.report('rendered')
    ctx.report('error', 'x'.repeat(500))
    ctx.send({ hello: 1 })
    await vi.waitFor(() => expect(received).toHaveLength(4))
    expect(received).toContainEqual({ v, type: 'event', name: 'rendered' })
    expect(received).toContainEqual({ v, type: 'module', name: 'unit', payload: { hello: 1 } })
    const error = received.find((m) => (m as { name?: string }).name === 'error') as {
      message: string
    }
    expect(error.message.length).toBeLessThanOrEqual(200)
  })

  it('reports the height of html over the channel', async () => {
    const resize = installResize()
    stop = runFrame({ win: window, modules: [] }).stop
    const { received } = handshake()
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'ready' }))
    resize.fire(240)
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'size', height: 240 }))
  })

  it('tells the host a unit was viewed, with the checks that ran, and no token', async () => {
    const io = installIntersection(true)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { module } = probe()
    stop = runFrame({ win: window, modules: [module] }).stop
    const { received } = handshake()
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'ready' }))
    io.current().fire({ intersectionRatio: 1, isVisible: true })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'event', name: 'viewed', occlusion: 'checked' }),
    )
    for (const message of received as Record<string, unknown>[]) {
      expect(Object.keys(message).join()).not.toMatch(/token|secret|proof/i)
    }
  })

  it('takes a theme change, a consent change and a module message from the host', async () => {
    const { module, start } = probe('unit')
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }))
    stop = runFrame({
      win: window,
      modules: [module],
      fetch: fetchImpl as unknown as typeof fetch,
    }).stop
    const { port, received } = handshake()
    await vi.waitFor(() => expect(start).toHaveBeenCalled())
    const ctx = start.mock.calls[0]?.[0]
    const heard = vi.fn()
    ctx.onMessage(heard)

    port.postMessage({ v, type: 'theme', theme: { scheme: 'light', accent: '#123456' } })
    port.postMessage({ v, type: 'module', name: 'unit', payload: 'hi' })
    port.postMessage({ v, type: 'module', name: 'other', payload: 'no' })
    port.postMessage({ v, type: 'consent', state: 'granted' })
    port.postMessage({ v: 99, type: 'consent', state: 'denied' })
    await vi.waitFor(() => expect(ctx.consent()).toBe('granted'))
    expect(root.style.getPropertyValue('color-scheme')).toBe('light')
    expect(root.style.getPropertyValue('--sdk-accent')).toBe('#123456')
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith('hi')

    ctx.track({ n: 1 })
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(received.length).toBeGreaterThan(0)
  })

  it('does not track before the host grants consent', async () => {
    const { module, start } = probe()
    const fetchImpl = vi.fn(async () => new Response('{}'))
    stop = runFrame({
      win: window,
      modules: [module],
      fetch: fetchImpl as unknown as typeof fetch,
    }).stop
    handshake()
    await vi.waitFor(() => expect(start).toHaveBeenCalled())
    start.mock.calls[0]?.[0].track({ n: 1 })
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps going when a module throws, and says so', async () => {
    const bad: FrameModule = {
      name: 'bad',
      start() {
        throw new Error('module bug')
      },
    }
    const good = probe('good')
    stop = runFrame({ win: window, modules: [bad, good.module] }).stop
    const { received } = handshake()
    await vi.waitFor(() => expect(good.start).toHaveBeenCalled())
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'event', name: 'error', message: 'module bug' }),
    )
  })

  it('runs the cleanups when the host says destroy', async () => {
    const { module, cleanup } = probe()
    stop = runFrame({ win: window, modules: [module] }).stop
    const { port } = handshake()
    await vi.waitFor(() => expect(port).toBeDefined())
    port.postMessage({ v, type: 'destroy' })
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
  })
})
