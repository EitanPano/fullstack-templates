import { afterEach, describe, expect, it, vi } from 'vitest'

import { client } from '@/lib/api/client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('client', () => {
  it('calls the page origin at a relative /api path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ status: 'ok', version: '0.1.0', uptimeSeconds: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    const { data } = await client.GET('/api/health')

    expect(data?.version).toBe('0.1.0')
    expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe(
      `${window.location.origin}/api/health`,
    )
  })

  it('returns the error body and status on a non-2xx answer instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
        ),
    )

    const { data, error, response } = await client.GET('/api/health')

    expect(data).toBeUndefined()
    expect(error).toMatchObject({ error: { code: 'internal' } })
    expect(response.status).toBe(500)
  })
})
