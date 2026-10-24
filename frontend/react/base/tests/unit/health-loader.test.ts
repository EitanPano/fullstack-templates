import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadHealth } from '@/feature/health/api/health'

// Loaders are tested by stubbing fetch, never by starting the API.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadHealth', () => {
  it('maps a healthy response to a view', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ status: 'ok', version: '0.1.0', uptimeSeconds: 7 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadHealth()).resolves.toEqual({ version: '0.1.0', uptimeSeconds: 7 })

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(request.method).toBe('GET')
    expect(request.url).toBe(`${window.location.origin}/api/health`)
  })

  it('throws the status when the API answers with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'internal', message: 'boom' }, requestId: 'r1' },
            { status: 500 },
          ),
        ),
    )

    await expect(loadHealth()).rejects.toThrow('API responded 500')
  })

  it('lets a network failure propagate to the route error boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(loadHealth()).rejects.toThrow('Failed to fetch')
  })
})
