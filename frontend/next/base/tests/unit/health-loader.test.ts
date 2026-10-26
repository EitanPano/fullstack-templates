import { afterEach, describe, expect, it, vi } from 'vitest'

// next/cache only works inside a Next request; the loader's cache directives are asserted instead.
vi.mock('next/cache', () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }))

const { getHealth } = await import('@/entity/health/server/health')
const { cacheLife, cacheTag } = await import('next/cache')

// Server code is tested by stubbing fetch, never by starting the API.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getHealth', () => {
  it('returns the version and uptime of a healthy API', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ status: 'ok', uptimeSeconds: 7, version: '0.1.0' }, { status: 200 }),
        ),
    )

    await expect(getHealth()).resolves.toEqual({ version: '0.1.0', uptimeSeconds: 7 })
  })

  it('is a public cached read: tagged with the entity and given a lifetime', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ status: 'ok', uptimeSeconds: 7, version: '0.1.0' })),
    )

    await getHealth()

    expect(cacheTag).toHaveBeenCalledWith('health')
    expect(cacheLife).toHaveBeenCalledWith('seconds')
  })

  it('throws our copy when the API answers with an error, so a failure is never cached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
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

    await expect(getHealth()).rejects.toMatchObject({
      name: 'ActionError',
      message: 'Something went wrong on our side. Try again.',
    })
  })

  it('throws our copy, logs the cause and leaks no address when the API cannot be reached', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:4000')))

    const failure = await getHealth().catch((e: unknown) => e)

    expect(failure).toMatchObject({
      message: "Can't reach the server. Check your connection and try again.",
    })
    expect((failure as Error).message).not.toContain('10.0.0.5')
    expect(error).toHaveBeenCalled()
  })
})
