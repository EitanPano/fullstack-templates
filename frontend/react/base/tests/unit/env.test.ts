import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('env', () => {
  it('exposes the parsed browser-visible values', async () => {
    vi.stubEnv('MODE', 'production')

    const { env } = await import('@/env')

    expect(env.MODE).toBe('production')
  })

  it('refuses to load when a declared value is missing', async () => {
    vi.stubEnv('MODE', undefined)
    vi.resetModules()

    await expect(import('@/env')).rejects.toThrow()
  })
})
