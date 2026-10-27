import { afterEach, describe, expect, it, vi } from 'vitest'

import { getApiHealth } from '@/shared/api/generated'

// The generated client is configured by shared/api/client.ts: relative /api on the page's origin
// and same-origin cookies. fetch is stubbed per test; the client resolves it on every call.
const ok = () => Response.json({ status: 'ok', version: '1', uptimeSeconds: 1 })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the SPA client', () => {
  it('calls the page origin with same-origin credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchMock)

    await getApiHealth()

    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(new URL(request.url).origin).toBe(window.location.origin)
    expect(new URL(request.url).pathname).toBe('/api/health')
    expect(request.credentials).toBe('same-origin')
    expect(request.headers.get('authorization')).toBeNull()
  })
})
