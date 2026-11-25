import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appendText, createLink } from '../../src/frame/dom'
import { listenForHandshake } from '../../src/frame/handshake'
import { createMeter } from '../../src/frame/meter'
import { createSender } from '../../src/frame/sender'
import { observeHeight } from '../../src/frame/size'
import { HANDSHAKE_KIND, PROTOCOL_VERSION } from '../../src/protocol'

import { installIntersection, installResize, setViewport, setVisibility } from './helpers'

const v = PROTOCOL_VERSION

afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
  setViewport(1024, 768)
})

describe('handshake answer', () => {
  const parent = {}
  const fakeWindow = (ancestor?: string) => {
    let listener: (event: MessageEvent) => void = () => undefined
    return {
      win: {
        parent,
        location: ancestor ? { ancestorOrigins: [ancestor] } : {},
        addEventListener: (_type: string, fn: (event: MessageEvent) => void) => (listener = fn),
        removeEventListener: vi.fn(),
      } as unknown as Window,
      deliver: (init: {
        data?: unknown
        origin?: string
        source?: unknown
        ports?: MessagePort[]
      }) =>
        listener({
          data: init.data ?? { kind: HANDSHAKE_KIND, v },
          origin: init.origin ?? 'https://host.example.test',
          source: init.source ?? parent,
          ports: init.ports ?? [],
        } as unknown as MessageEvent),
    }
  }

  it('answers ready on the port the parent handed over', async () => {
    const { win, deliver } = fakeWindow('https://host.example.test')
    const onPort = vi.fn()
    listenForHandshake({ win, onPort })
    const channel = new MessageChannel()
    const answers: unknown[] = []
    channel.port1.onmessage = (event) => answers.push(event.data)
    deliver({ ports: [channel.port2] })
    expect(onPort).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(answers).toEqual([{ v, type: 'ready' }]))
  })

  it.each([
    ['a message from another window', { source: {} }],
    ['a message that is not a handshake', { data: { kind: 'x' } }],
    ['a handshake with no port', { ports: [] as MessagePort[] }],
    ['a handshake from an origin that is not the parent', { origin: 'https://evil.example.test' }],
  ])('ignores %s', (_label, init) => {
    const { win, deliver } = fakeWindow('https://host.example.test')
    const onPort = vi.fn()
    listenForHandshake({ win, onPort })
    const channel = new MessageChannel()
    deliver({ ports: [channel.port2], ...init })
    expect(onPort).not.toHaveBeenCalled()
  })

  it('takes the first handshake only', () => {
    const { win, deliver } = fakeWindow()
    const onPort = vi.fn()
    listenForHandshake({ win, onPort })
    deliver({ ports: [new MessageChannel().port2] })
    deliver({ ports: [new MessageChannel().port2] })
    expect(onPort).toHaveBeenCalledTimes(1)
  })
})

describe('size report', () => {
  it('reports the height of html, once per change', () => {
    const resize = installResize()
    const report = vi.fn()
    observeHeight({ win: window, report })
    resize.fire(150.2)
    resize.fire(150.2)
    resize.fire(200)
    expect(report.mock.calls).toEqual([[151], [200]])
  })

  it('does nothing where the engine has no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    expect(() => observeHeight({ win: window, report: vi.fn() })).not.toThrow()
  })
})

describe('visibility meter', () => {
  let io: ReturnType<typeof installIntersection>
  const target = () => document.body.appendChild(document.createElement('div'))
  const start = (v2: boolean) => {
    io = installIntersection(v2)
    vi.useFakeTimers()
    const onView = vi.fn()
    const meter = createMeter({ win: window, target: target(), onView })
    return { onView, meter }
  }

  beforeEach(() => {
    setVisibility('visible')
    setViewport(1024, 768)
  })

  it('sees the unit after a continuous second at half the pixels, with the check that ran', () => {
    const { onView } = start(true)
    io.current().fire({ intersectionRatio: 0.6, isVisible: true })
    vi.advanceTimersByTime(999)
    expect(onView).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onView).toHaveBeenCalledWith('checked')
  })

  it('says the check was unavailable where the engine lacks it', () => {
    const { onView } = start(false)
    io.current().fire({ intersectionRatio: 1 })
    vi.advanceTimersByTime(1000)
    expect(onView).toHaveBeenCalledWith('unavailable')
  })

  it('asks for the visibility check only where the engine has it', () => {
    start(true)
    expect(io.current().options.trackVisibility).toBe(true)
    start(false)
    expect(io.current().options.trackVisibility).toBeUndefined()
  })

  it('does not see it when the ratio drops inside the second', () => {
    const { onView } = start(true)
    io.current().fire({ intersectionRatio: 0.6, isVisible: true })
    vi.advanceTimersByTime(600)
    io.current().fire({ intersectionRatio: 0.3, isVisible: true })
    vi.advanceTimersByTime(2000)
    expect(onView).not.toHaveBeenCalled()
  })

  it('does not see it when the engine says it is covered or hidden (isVisible false)', () => {
    const { onView } = start(true)
    io.current().fire({ intersectionRatio: 1, isVisible: false })
    vi.advanceTimersByTime(2000)
    expect(onView).not.toHaveBeenCalled()
  })

  it('does not see it while the page is hidden, and counts again once it is back', () => {
    const { onView } = start(false)
    io.current().fire({ intersectionRatio: 1 })
    vi.advanceTimersByTime(500)
    setVisibility('hidden')
    vi.advanceTimersByTime(2000)
    expect(onView).not.toHaveBeenCalled()
    setVisibility('visible')
    vi.advanceTimersByTime(1000)
    expect(onView).toHaveBeenCalledTimes(1)
  })

  it('does not see a frame of a pixel', () => {
    const { onView } = start(false)
    setViewport(1, 1)
    io.current().fire({ intersectionRatio: 1 })
    vi.advanceTimersByTime(2000)
    expect(onView).not.toHaveBeenCalled()
  })

  it('reports a view once', () => {
    const { onView } = start(false)
    io.current().fire({ intersectionRatio: 1 })
    vi.advanceTimersByTime(1000)
    io.current().fire({ intersectionRatio: 0 })
    io.current().fire({ intersectionRatio: 1 })
    vi.advanceTimersByTime(5000)
    expect(onView).toHaveBeenCalledTimes(1)
    expect(io.current().disconnected).toBe(true)
  })

  it('never sees anything where the engine has no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const onView = vi.fn()
    expect(() => createMeter({ win: window, target: target(), onView })).not.toThrow()
    expect(onView).not.toHaveBeenCalled()
  })
})

describe('untrusted strings', () => {
  it('lands a string with markup as text', () => {
    const el = document.createElement('p')
    appendText(el, '<img src=x onerror=alert(1)><b>hi</b>')
    expect(el.children).toHaveLength(0)
    expect(el.textContent).toBe('<img src=x onerror=alert(1)><b>hi</b>')
  })

  it('draws a link only when it is https, with no opener', () => {
    const link = createLink(document, 'https://example.test/offer', '<b>Offer</b>')
    expect(link?.getAttribute('href')).toBe('https://example.test/offer')
    expect(link?.textContent).toBe('<b>Offer</b>')
    expect(link?.children).toHaveLength(0)
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link?.getAttribute('target')).toBe('_blank')
  })

  it.each(['http://example.test', 'javascript:alert(1)', 'data:text/html,x', '//example.test', ''])(
    'refuses the link %j',
    (href) => {
      expect(createLink(document, href, 'x')).toBeNull()
    },
  )
})

describe('frame sender', () => {
  const make = (allowed: boolean) => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }))
    const sender = createSender({
      key: 'pk_a',
      win: window,
      allowed: () => allowed,
      fetch: fetchImpl as unknown as typeof fetch,
    })
    return { sender, fetchImpl }
  }

  it('posts one JSON batch to its own origin with the key, no cookie and keepalive', () => {
    const { sender, fetchImpl } = make(true)
    sender.push({ n: 1 })
    window.dispatchEvent(new Event('pagehide'))
    setVisibility('hidden')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${window.location.origin}/api/sdk/v1/telemetry`)
    expect(init.credentials).toBe('omit')
    expect(init.keepalive).toBe(true)
    expect('cache' in init).toBe(false)
    expect((init.headers as Record<string, string>)['X-Sdk-Key']).toBe('pk_a')
    expect(JSON.parse(init.body as string)).toEqual({ events: [{ n: 1 }] })
    sender.dispose()
  })

  it('sends nothing while consent does not allow it', () => {
    const { sender, fetchImpl } = make(false)
    sender.push({ n: 1 })
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchImpl).not.toHaveBeenCalled()
    sender.dispose()
  })
})
