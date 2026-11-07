import { afterEach, describe, expect, it, vi } from 'vitest'

import { createClientConfig } from '@/core/config/api-client'
import { getApiHealth } from '@/services/generated/sdk.gen'

afterEach(() => {
  vi.unstubAllGlobals()
})

// The generated client reads this config when it is created. Everything is on the page's own
// origin with cookies, and the page never sends a token of its own.
describe('createClientConfig', () => {
  it('points at the page origin and sends cookies on the same origin only', () => {
    expect(createClientConfig({})).toMatchObject({
      baseUrl: window.location.origin,
      credentials: 'same-origin',
    })
  })

  it('sends a request to the page origin with no Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    await getApiHealth()

    const request = (fetchMock.mock.calls[0] as [Request])[0]
    expect(new URL(request.url).origin).toBe(window.location.origin)
    expect(new URL(request.url).pathname).toBe('/api/health')
    expect(request.credentials).toBe('same-origin')
    expect(request.headers.has('authorization')).toBe(false)
  })
})
