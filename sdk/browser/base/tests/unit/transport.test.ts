import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTransport } from '../../src/transport'

const ORIGIN = 'https://api.example.test'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const make = (
  fetchImpl: typeof fetch,
  extra: Partial<Parameters<typeof createTransport>[0]> = {},
) =>
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

describe('transport request', () => {
  it('sends the key header, omits credentials and sets no cache mode', async () => {
    const fetchImpl = vi.fn(async () => json({ enabled: true }))
    const transport = make(fetchImpl)
    await expect(transport.getJson('/api/sdk/v1/config')).resolves.toEqual({ enabled: true })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${ORIGIN}/api/sdk/v1/config`)
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>)['X-Sdk-Key']).toBe('pk_a')
    expect('cache' in init).toBe(false)
    expect(init.signal).toBeInstanceOf(AbortSignal)
    transport.dispose()
  })

  it('has no telemetry buffer: it only reads and disposes', () => {
    const transport = make(vi.fn(async () => json({})))
    expect(Object.keys(transport).sort()).toEqual(['dispose', 'getJson'])
  })

  it('fails on a slow read after the timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }),
    ) as unknown as typeof fetch
    const transport = make(fetchImpl, { timeoutMs: 1000, retries: 0 })
    const result = transport.getJson('/api/sdk/v1/config')
    const settled = expect(result).rejects.toThrow('timeout')
    await vi.advanceTimersByTimeAsync(1000)
    await settled
  })

  it('retries a network failure and a 5xx, once by default', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ ok: 1 }))
    const transport = make(fetchImpl, { retries: 2 })
    await expect(transport.getJson('/x')).resolves.toEqual({ ok: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('gives up after the retries', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network'))
    const transport = make(fetchImpl, { retries: 1 })
    await expect(transport.getJson('/x')).rejects.toThrow('network')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 4xx and fails on it', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 1 }, 403))
    const transport = make(fetchImpl, { retries: 2 })
    await expect(transport.getJson('/x')).rejects.toThrow('status 403')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails on a body that is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200 }))
    const transport = make(fetchImpl, { retries: 0 })
    await expect(transport.getJson('/x')).rejects.toThrow()
  })
})
