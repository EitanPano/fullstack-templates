import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTransport } from '../../src/transport'

const ORIGIN = 'https://api.example.test'
const make = (fetchImpl: typeof fetch, extra = {}) =>
  createTransport({
    apiOrigin: ORIGIN,
    key: 'pk_a',
    fetch: fetchImpl,
    retryDelayMs: 0,
    ...extra,
  })

afterEach(() => {
  vi.useRealTimers()
})

describe('transport edges', () => {
  it('times out a body that never ends, and does not retry it', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async () => {
      const response = new Response('{}')
      vi.spyOn(response, 'json').mockReturnValue(new Promise(() => undefined))
      return response
    })
    const transport = make(fetchImpl as unknown as typeof fetch, { timeoutMs: 1000, retries: 1 })
    const caught = transport.getJson('/api/sdk/v1/config').catch((error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(1500)
    expect(await caught).toBe('timeout')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('aborts a read in flight on dispose', async () => {
    let signal: AbortSignal | undefined
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
      )
    })
    const transport = make(fetchImpl as unknown as typeof fetch, { retries: 0 })
    const result = transport.getJson('/api/sdk/v1/config').catch(() => 'stopped')
    transport.dispose()
    expect(signal?.aborted).toBe(true)
    expect(await result).toBe('stopped')
  })
})
