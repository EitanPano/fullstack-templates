import { describe, expect, it } from 'vitest'

import { KEY_HEADER, requestInit } from '../../src/protocol'

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
