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

  it('is unset when empty', async () => {
    expect((await load('')).CLIENT_IP_HEADER).toBeUndefined()
  })

  it.each(['x y', 'x:', 'x_y', 'x-forwarded-for, x-real-ip', 'x\ty', 'é'])(
    'refuses %j at startup, naming the variable, instead of failing every request',
    async (name) => {
      await expect(load(name)).rejects.toThrow(/CLIENT_IP_HEADER/)
    },
  )
})
