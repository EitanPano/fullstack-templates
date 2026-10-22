import { describe, expect, it } from 'bun:test'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

import { loadEnv } from '../src/config/env'

// The process entry under a real bind failure, in a child process: it must not report
// success, and it must leave with a non-zero code instead of lingering. The blocker is an
// http server like the entry's own, so the second bind fails the same way on every OS.
describe('the entry', () => {
  it('exits 1 and logs the failure when the port is already taken', async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => {
      blocker.listen(0, resolve)
    })
    const address = blocker.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    expect(port).toBeGreaterThan(0)

    try {
      const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url))
      const child = Bun.spawn(['bun', 'run', entry], {
        env: { ...process.env, PORT: String(port), NODE_ENV: 'development' },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const exitCode = await child.exited
      const stderr = await new Response(child.stderr).text()
      const stdout = await new Response(child.stdout).text()

      expect(exitCode).toBe(1)
      expect(stderr).toContain(`listen failed port=${String(port)}`)
      expect(stdout).not.toContain('listening')
    } finally {
      blocker.close()
    }
  }, 15_000)
})

const SECRET = 'a-production-secret-of-at-least-32-characters' // @auth
const KEY = Buffer.alloc(32, 7).toString('base64')
const productionSource = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: `${SECRET}-1`, // @auth
  JWT_REFRESH_SECRET: `${SECRET}-2`, // @auth
  OTP_SECRET: `${SECRET}-3`, // @auth
  ENCRYPTION_KEY: KEY,
}

// loadEnv takes an explicit source, so these cases never read the real environment.
describe('loadEnv', () => {
  // @auth-start
  it('names the missing secret in production', () => {
    const { JWT_ACCESS_SECRET: _omitted, ...source } = productionSource

    expect(() => loadEnv(source)).toThrow(/JWT_ACCESS_SECRET/)
  })

  it('rejects a too-short secret in production', () => {
    expect(() => loadEnv({ ...productionSource, OTP_SECRET: 'short' })).toThrow(/OTP_SECRET/)
  })
  // @auth-end
  // @noauth-start
  it('names the missing secret in production', () => {
    const { ENCRYPTION_KEY: _omitted, ...source } = productionSource

    expect(() => loadEnv(source)).toThrow(/ENCRYPTION_KEY/)
  })
  // @noauth-end

  it('rejects an encryption key that is not 32 bytes in production', () => {
    const short = Buffer.alloc(16).toString('base64')

    expect(() => loadEnv({ ...productionSource, ENCRYPTION_KEY: short })).toThrow(/ENCRYPTION_KEY/)
  })

  it('refuses placeholder secrets in production, naming the variable', () => {
    // @auth-start
    expect(() => loadEnv({ ...productionSource, OTP_SECRET: `change-me-${SECRET}` })).toThrow(
      /OTP_SECRET: is a placeholder/,
    )
    expect(() => loadEnv({ ...productionSource, JWT_ACCESS_SECRET: `dev-only-${SECRET}` })).toThrow(
      /JWT_ACCESS_SECRET: is a placeholder/,
    )
    expect(() =>
      loadEnv({
        ...productionSource,
        JWT_REFRESH_SECRET: 'dev-only-refresh-secret-change-me-012345678',
      }),
    ).toThrow(/JWT_REFRESH_SECRET: is a placeholder/)
    // @auth-end
    expect(() =>
      loadEnv({
        ...productionSource,
        ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      }),
    ).toThrow(/ENCRYPTION_KEY: is a placeholder/)
  })

  // @auth-start
  it('refuses one value for both JWT secrets in production', () => {
    expect(() =>
      loadEnv({ ...productionSource, JWT_REFRESH_SECRET: productionSource.JWT_ACCESS_SECRET }),
    ).toThrow(/JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET/)
  })
  // @auth-end

  it('does not apply the placeholder check outside production', () => {
    expect(() => loadEnv({ OTP_SECRET: `change-me-${SECRET}` })).not.toThrow() // @auth
    expect(() => loadEnv({ ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' })).not.toThrow() // @noauth
  })

  it('requires MAIL_FROM when the mail provider is not console', () => {
    expect(() => loadEnv({ MAIL_PROVIDER: 'smtp' })).toThrow(/MAIL_FROM/)
    expect(loadEnv({ MAIL_PROVIDER: 'smtp', MAIL_FROM: 'a@b.co' }).env.MAIL_PROVIDER).toBe('smtp')
  })

  it('returns no defaulted secret when production supplies all of them', () => {
    const { env, defaultedSecrets } = loadEnv(productionSource)

    expect(defaultedSecrets).toEqual([])
    expect(env.JWT_ACCESS_SECRET).toBe(`${SECRET}-1`) // @auth
    expect(env.ENCRYPTION_KEY).toBe(KEY) // @noauth
  })

  it('falls back to development defaults and names the four secrets', () => { // @auth
  it('falls back to a development default and names the encryption key', () => { // @noauth
    const { env, defaultedSecrets } = loadEnv({})

    expect(defaultedSecrets).toEqual([
      'JWT_ACCESS_SECRET', // @auth
      'JWT_REFRESH_SECRET', // @auth
      'OTP_SECRET', // @auth
      'ENCRYPTION_KEY',
    ])
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(4000)
    expect(env.JWT_ACCESS_SECRET).not.toBe(env.JWT_REFRESH_SECRET) // @auth
    expect(Buffer.from(env.ENCRYPTION_KEY, 'base64')).toHaveLength(32)
  })

  // @auth-start
  it('records only the secrets that fell back', () => {
    const { defaultedSecrets } = loadEnv({ OTP_SECRET: `${SECRET}-3` })

    expect(defaultedSecrets).toEqual(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'])
  })
  // @auth-end

  it('parses TRUST_PROXY as a boolean, a number or a string', () => {
    expect(loadEnv({}).env.TRUST_PROXY).toBe(false)
    expect(loadEnv({ TRUST_PROXY: '1' }).env.TRUST_PROXY).toBe(1)
    expect(loadEnv({ TRUST_PROXY: 'true' }).env.TRUST_PROXY).toBe(true)
    expect(loadEnv({ TRUST_PROXY: 'false' }).env.TRUST_PROXY).toBe(false)
    expect(loadEnv({ TRUST_PROXY: '0' }).env.TRUST_PROXY).toBe(0)
    expect(loadEnv({ TRUST_PROXY: '' }).env.TRUST_PROXY).toBe(false)
    expect(loadEnv({ TRUST_PROXY: '  ' }).env.TRUST_PROXY).toBe(false)
    expect(loadEnv({ TRUST_PROXY: '10.0.0.1' }).env.TRUST_PROXY).toBe('10.0.0.1')
  })

  it('splits CORS_ORIGINS, trimmed, and leaves it undefined when unset', () => {
    expect(loadEnv({ CORS_ORIGINS: 'a, b,,' }).env.CORS_ORIGINS).toEqual(['a', 'b'])
    expect(loadEnv({}).env.CORS_ORIGINS).toBeUndefined()
  })

  it('treats a blank CORS_ORIGINS as unset', () => {
    expect(loadEnv({ CORS_ORIGINS: '' }).env.CORS_ORIGINS).toBeUndefined()
    expect(loadEnv({ CORS_ORIGINS: '   ' }).env.CORS_ORIGINS).toBeUndefined()
  })

  // @auth-start
  it('treats a blank COOKIE_DOMAIN as unset', () => {
    expect(loadEnv({ COOKIE_DOMAIN: '' }).env.COOKIE_DOMAIN).toBeUndefined()
    expect(loadEnv({ COOKIE_DOMAIN: ' ' }).env.COOKIE_DOMAIN).toBeUndefined()
    expect(loadEnv({ COOKIE_DOMAIN: ' x ' }).env.COOKIE_DOMAIN).toBe('x')
  })
  // @auth-end

  it('parses JOBS_ENABLED as a boolean, true by default', () => {
    expect(loadEnv({}).env.JOBS_ENABLED).toBe(true)
    expect(loadEnv({ JOBS_ENABLED: 'false' }).env.JOBS_ENABLED).toBe(false)
    expect(() => loadEnv({ JOBS_ENABLED: 'maybe' })).toThrow(/JOBS_ENABLED/)
  })
})
