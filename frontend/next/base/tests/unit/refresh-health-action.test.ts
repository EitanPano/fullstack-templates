import { afterEach, describe, expect, it, vi } from 'vitest'

// updateTag is Server Action only; the test asserts it is the one that re-renders what changed.
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

const { refreshHealth } = await import('@/feature/refresh-health/server/action')
const { updateTag } = await import('next/cache')

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('refreshHealth', () => {
  it('pings the API, then expires the health tag so the widget reads fresh data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ status: 'ok', uptimeSeconds: 1, version: '0.1.0' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshHealth()

    expect(result.data).toEqual({ refreshed: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(updateTag).toHaveBeenCalledWith('health')
  })

  it('answers with our copy and expires nothing when the API is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const result = await refreshHealth()

    expect(result.serverError).toBe("Can't reach the server. Check your connection and try again.")
    expect(updateTag).not.toHaveBeenCalled()
  })
})
