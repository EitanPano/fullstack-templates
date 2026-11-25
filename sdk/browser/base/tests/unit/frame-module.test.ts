import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runFrame, type FrameModule } from '../../src/frame'
import { HANDSHAKE_KIND, PROTOCOL_VERSION, isKey, isModuleName } from '../../src/protocol'

import { installIntersection, setViewport, setVisibility } from './helpers'

// The frame serves one module, named in its address; the meter starts when that module has drawn
// and tells it; a failure crosses to the host as a fixed code and never as the module's text.
const v = PROTOCOL_VERSION
const MARKER = 'tok_SECRET_marker_9f3'

function handshake() {
  const channel = new MessageChannel()
  const received: Record<string, unknown>[] = []
  channel.port1.onmessage = (event) => received.push(event.data as Record<string, unknown>)
  const event = new MessageEvent('message', {
    data: { kind: HANDSHAKE_KIND, v },
    origin: 'https://host.example.test',
    source: window,
  })
  Object.defineProperty(event, 'ports', { value: [channel.port2] })
  window.dispatchEvent(event)
  return { received }
}

const probe = (name: string) => {
  const start = vi.fn()
  const module: FrameModule = { name, start: (ctx) => void start(ctx) }
  return { module, start }
}

let stop: () => void = () => undefined
const address = (query: string) => window.history.replaceState({}, '', `/api/sdk/frame/v1?${query}`)

beforeEach(() => {
  address('k=pk_a&m=unit')
  document.body.replaceChildren()
})
afterEach(() => {
  stop()
  vi.useRealTimers()
  setVisibility('visible')
  setViewport(1024, 768)
})

describe('one frame, one module', () => {
  it('starts only the module the address names', async () => {
    const unit = probe('unit')
    const other = probe('other')
    stop = runFrame({ win: window, modules: [other.module, unit.module] }).stop
    handshake()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalledTimes(1))
    expect(other.start).not.toHaveBeenCalled()
  })

  it('starts none for an unknown name and reports a fixed code', async () => {
    address('k=pk_a&m=missing')
    const unit = probe('unit')
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received } = handshake()
    await vi.waitFor(() =>
      expect(received).toContainEqual({
        v,
        type: 'event',
        name: 'error',
        message: 'module_failed',
        module: 'missing',
      }),
    )
    expect(unit.start).not.toHaveBeenCalled()
  })

  it('starts none when the address names no module', async () => {
    address('k=pk_a')
    const unit = probe('unit')
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received } = handshake()
    await vi.waitFor(() => expect(received).toContainEqual({ v, type: 'ready' }))
    expect(unit.start).not.toHaveBeenCalled()
  })
})

describe('what the host is told of a failure', () => {
  it('is a fixed code and the module name, never the error text', async () => {
    const bad: FrameModule = {
      name: 'unit',
      start() {
        throw new Error(`unit ${MARKER} expired`)
      },
    }
    stop = runFrame({ win: window, modules: [bad] }).stop
    const { received } = handshake()
    await vi.waitFor(() =>
      expect(received).toContainEqual({
        v,
        type: 'event',
        name: 'error',
        message: 'module_failed',
        module: 'unit',
      }),
    )
    expect(JSON.stringify(received)).not.toContain(MARKER)
  })

  it('replaces free text a module passes to report', async () => {
    const unit = probe('unit')
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received } = handshake()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    unit.start.mock.calls[0]?.[0].report('error', `lost ${MARKER}`)
    await vi.waitFor(() => expect(received.some((m) => m['name'] === 'error')).toBe(true))
    expect(JSON.stringify(received)).not.toContain(MARKER)
  })
})

describe('the meter, for a module', () => {
  it('starts when the module has rendered, not at the handshake, and tells the module', async () => {
    const io = installIntersection(true)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const unit = probe('unit')
    stop = runFrame({ win: window, modules: [unit.module] }).stop
    const { received } = handshake()
    await vi.waitFor(() => expect(unit.start).toHaveBeenCalled())
    // Nothing drawn yet: no observer exists.
    expect(() => io.current()).toThrow('no IntersectionObserver')
    const ctx = unit.start.mock.calls[0]?.[0]
    const seen = vi.fn()
    ctx.onView(seen)
    ctx.report('rendered')
    io.current().fire({ intersectionRatio: 1, isVisible: true })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith('checked'))
    await vi.waitFor(() =>
      expect(received).toContainEqual({ v, type: 'event', name: 'viewed', occlusion: 'checked' }),
    )
  })
})

describe('the key and the module name', () => {
  it('have one pattern each: the servers key, and a short lowercase name', () => {
    expect(isKey('pk_live.a-1')).toBe(true)
    expect(isKey('a'.repeat(128))).toBe(true)
    expect(isKey('a'.repeat(129))).toBe(false)
    expect(isKey('has space')).toBe(false)
    expect(isKey('')).toBe(false)
    expect(isModuleName('unit-2')).toBe(true)
    expect(isModuleName('Unit')).toBe(false)
  })
})
