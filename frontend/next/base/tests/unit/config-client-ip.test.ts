import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// The config module parses the process variables once, when it loads, so each case loads it fresh.
async function load(header: string) {
  vi.resetModules()
  vi.stubEnv('CLIENT_IP_HEADER', header)
  return (await import('@/shared/config/env')).env
}

describe('CLIENT_IP_HEADER', () => {
  it.each(['x-forwarded-for', 'X-Real-IP', '  x-real-ip  '])(
    'accepts the header name %j',
    async (name) => {
      const config = await load(name)

      expect(config.CLIENT_IP_HEADER).toBe(name.trim().toLowerCase())
    },
  )

  // Compose passes `${CLIENT_IP_HEADER-}`, an empty string when the variable is unset; that must
  // boot like an unset variable, not answer every request with a 500.
  it.each(['', ' ', '   \t '])('is unset when blank (%j)', async (blank) => {
    expect((await load(blank)).CLIENT_IP_HEADER).toBeUndefined()
  })

  it('is unset when the variable is absent', async () => {
    vi.resetModules()
    vi.stubEnv('CLIENT_IP_HEADER', undefined)
    expect((await import('@/shared/config/env')).env.CLIENT_IP_HEADER).toBeUndefined()
  })

  it.each(['x y', 'x:', 'x_y', 'x-forwarded-for, x-real-ip', 'x\ty', 'é'])(
    'refuses %j at startup, naming the variable, instead of failing every request',
    async (name) => {
      await expect(load(name)).rejects.toThrow(/CLIENT_IP_HEADER/)
    },
  )
})
