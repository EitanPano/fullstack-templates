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
})
