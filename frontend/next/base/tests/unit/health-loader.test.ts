import { afterEach, describe, expect, it, vi } from 'vitest'

import { getHealth } from '@/feature/health/server/health'

// Server code is tested by stubbing fetch, never by starting the API.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getHealth', () => {
  it('maps a healthy response to a reachable view', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ status: 'ok', uptimeSeconds: 7, version: '0.1.0' }, { status: 200 }),
        ),
    )

    await expect(getHealth()).resolves.toEqual({
      reachable: true,
      version: '0.1.0',
      uptimeSeconds: 7,
    })
  })

  it('reports the status when the API answers with an error', async () => {
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

    await expect(getHealth()).resolves.toEqual({ reachable: false, reason: 'API responded 500' })
  })

  it('reports a generic reason and logs the cause when the API cannot be reached', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    await expect(getHealth()).resolves.toEqual({ reachable: false, reason: 'connection failed' })
    expect(error).toHaveBeenCalledWith('health: API unreachable', expect.any(Error))
  })
})
