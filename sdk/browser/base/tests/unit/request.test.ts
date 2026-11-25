import { describe, expect, it, vi } from 'vitest'

import { KEY_HEADER, createTelemetryBuffer, requestInit } from '../../src/protocol'

describe('requestInit', () => {
  it('sends the key, omits credentials and leaves the cache mode alone', () => {
    const init = requestInit({ key: 'pk_a', signal: new AbortController().signal })
    expect(init.credentials).toBe('omit')
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>)[KEY_HEADER]).toBe('pk_a')
    expect('cache' in init).toBe(false)
    expect('keepalive' in init).toBe(false)
  })

  it('sends a JSON body with keepalive', () => {
    const init = requestInit({
      key: 'pk_a',
      signal: new AbortController().signal,
      body: { a: 1 },
      keepalive: true,
    })
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(init.keepalive).toBe(true)
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })
})

describe('telemetry buffer', () => {
  const setup = (allowed = true) => {
    const send = vi.fn()
    const buffer = createTelemetryBuffer({ allowed: () => allowed, send, win: window })
    return { send, buffer }
  }
  const hide = () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('drains once when visibilitychange and pagehide both fire', () => {
    const { send, buffer } = setup()
    buffer.push({ n: 1 })
    buffer.push({ n: 2 })
    hide()
    window.dispatchEvent(new Event('pagehide'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith([{ n: 1 }, { n: 2 }])
    buffer.dispose()
  })

  it('sends nothing for an empty buffer', () => {
    const { send, buffer } = setup()
    window.dispatchEvent(new Event('pagehide'))
    expect(send).not.toHaveBeenCalled()
    buffer.dispose()
  })

  it('keeps nothing while consent does not allow it', () => {
    const { send, buffer } = setup(false)
    buffer.push({ n: 1 })
    window.dispatchEvent(new Event('pagehide'))
    expect(send).not.toHaveBeenCalled()
    buffer.dispose()
  })

  it('removes its listeners on dispose', () => {
    const { send, buffer } = setup()
    buffer.push({ n: 1 })
    buffer.dispose()
    window.dispatchEvent(new Event('pagehide'))
    expect(send).not.toHaveBeenCalled()
  })

  it('drops an item that cannot be serialised and sends the rest, without throwing', () => {
    const { send, buffer } = setup()
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    buffer.push({ n: 1 })
    buffer.push(circular)
    buffer.push({ big: 1n })
    buffer.push({ n: 2 })
    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow()
    expect(send).toHaveBeenCalledWith([{ n: 1 }, { n: 2 }])
    buffer.dispose()
  })

  it('measures a batch in UTF-8 bytes', () => {
    const { send, buffer } = setup()
    // 3 bytes per character, 1 UTF-16 unit each: 40 of these are 120 000 bytes.
    for (let i = 0; i < 40; i += 1) buffer.push({ t: '€'.repeat(1000) })
    window.dispatchEvent(new Event('pagehide'))
    for (const call of send.mock.calls) {
      const bytes = new TextEncoder().encode(JSON.stringify(call[0])).length
      expect(bytes).toBeLessThan(60_000)
    }
    expect(send).toHaveBeenCalled()
    buffer.dispose()
  })
})
