import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadEnv } from '../src/config/env'
import { describeStore } from './store'

// The process entry under a real bind failure, in a child process: it must not report
// success, and it must leave with a non-zero code instead of lingering. The blocker is an
// http server like the entry's own, so the second bind fails the same way on every OS.
describeStore('the entry', () => {
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
  DATABASE_URL: 'postgres://app:a-real-password@db.internal:5432/app', // @database:postgres
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

  it('falls back to development defaults and names each secret it defaulted', () => {
    const { env, defaultedSecrets } = loadEnv({})

    expect(defaultedSecrets).toEqual([
      'JWT_ACCESS_SECRET', // @auth
      'JWT_REFRESH_SECRET', // @auth
      'OTP_SECRET', // @auth
      'ENCRYPTION_KEY',
      'DATABASE_URL', // @database:postgres
    ])
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(4000)
    expect(env.JWT_ACCESS_SECRET).not.toBe(env.JWT_REFRESH_SECRET) // @auth
    expect(Buffer.from(env.ENCRYPTION_KEY, 'base64')).toHaveLength(32)
  })

  // @auth-start
  it('records only the secrets that fell back', () => {
    const { defaultedSecrets } = loadEnv({ OTP_SECRET: `${SECRET}-3` })

    expect(defaultedSecrets).toEqual([
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'DATABASE_URL', // @database:postgres
    ])
  })
  // @auth-end

  // @database:postgres-start
  it('requires the database URL in production and names it', () => {
    const { DATABASE_URL: _omitted, ...source } = productionSource

    expect(() => loadEnv(source)).toThrow(/DATABASE_URL/)
  })

  it('treats the empty string Compose passes for an unset variable as missing in production', () => {
    expect(() => loadEnv({ ...productionSource, DATABASE_URL: '' })).toThrow(/DATABASE_URL/)
    expect(loadEnv({ NODE_ENV: 'development', DATABASE_URL: '' }).defaultedSecrets).toContain(
      'DATABASE_URL',
    )
  })

  it('rejects a URL that is not a postgres one without echoing it', () => {
    const attempt = () =>
      loadEnv({ ...productionSource, DATABASE_URL: 'mysql://app:hunter2@db.internal/app' })

    expect(attempt).toThrow(/DATABASE_URL: must be a postgres/)
    expect(attempt).not.toThrow(/hunter2/)
  })

  it('accepts the postgresql scheme and refuses the local default in production', () => {
    const url = 'postgresql://app:a-real-password@db.internal:5432/app'

    expect(loadEnv({ ...productionSource, DATABASE_URL: url }).env.DATABASE_URL).toBe(url)
    expect(() =>
      loadEnv({ ...productionSource, DATABASE_URL: 'postgres://app:app@127.0.0.1:5432/app' }),
    ).toThrow(/DATABASE_URL: is a placeholder/)
  })

  it('defaults the database URL to the local service outside production', () => {
    expect(loadEnv({}).env.DATABASE_URL).toBe('postgres://app:app@127.0.0.1:5432/app')
  })

  it('defaults E2E_DATABASE_URL to the e2e database and refuses a URL that is not postgres', () => {
    expect(loadEnv({}).env.E2E_DATABASE_URL).toBe('postgres://app:app@127.0.0.1:5432/app_e2e')
    expect(() => loadEnv({ E2E_DATABASE_URL: 'mysql://u:p@h/x_e2e' })).toThrow(/E2E_DATABASE_URL/)
  })

  it('treats a blank E2E_DATABASE_URL as unset, so a production server that never uses it boots', () => {
    const blank = { ...productionSource, E2E_DATABASE_URL: '' }

    expect(loadEnv(blank).env.E2E_DATABASE_URL).toBe('postgres://app:app@127.0.0.1:5432/app_e2e')
  })
  // @database:postgres-end

  it('reads RATE_LIMIT_SCALE as a number of 1 or more and defaults it to 1', () => {
    expect(loadEnv({}).env.RATE_LIMIT_SCALE).toBe(1)
    expect(loadEnv({ RATE_LIMIT_SCALE: '25' }).env.RATE_LIMIT_SCALE).toBe(25)
    expect(loadEnv({ RATE_LIMIT_SCALE: '1.5' }).env.RATE_LIMIT_SCALE).toBe(1.5)
    expect(loadEnv({ RATE_LIMIT_SCALE: '1000' }).env.RATE_LIMIT_SCALE).toBe(1000)
  })

  it('keeps the default RATE_LIMIT_SCALE in production', () => {
    expect(loadEnv(productionSource).env.RATE_LIMIT_SCALE).toBe(1)
  })

  it('refuses a RATE_LIMIT_SCALE below 1 or not finite, naming the variable', () => {
    for (const bad of ['0', '0.5', '-3', 'abc', 'Infinity', 'NaN', '1001', '1e300']) {
      expect(() => loadEnv({ RATE_LIMIT_SCALE: bad })).toThrow(/RATE_LIMIT_SCALE/)
    }
  })

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

  it('leaves STATIC_DIR undefined when unset or blank and resolves it to an absolute path', () => {
    expect(loadEnv({}).env.STATIC_DIR).toBeUndefined()
    expect(loadEnv({ STATIC_DIR: '' }).env.STATIC_DIR).toBeUndefined()
    expect(loadEnv({ STATIC_DIR: '   ' }).env.STATIC_DIR).toBeUndefined()
    expect(loadEnv({ STATIC_DIR: 'dist' }).env.STATIC_DIR).toBe(join(process.cwd(), 'dist'))
  })

  it('refuses a production STATIC_DIR without an index.html and names it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'static-dir-'))
    try {
      expect(() => loadEnv({ ...productionSource, STATIC_DIR: dir })).toThrow(
        /invalid environment: STATIC_DIR: .* has no index\.html/,
      )
      expect(() => loadEnv({ ...productionSource, STATIC_DIR: join(dir, 'missing') })).toThrow(
        /STATIC_DIR/,
      )
      // A directory named index.html is not the file.
      mkdirSync(join(dir, 'index.html'))
      expect(() => loadEnv({ ...productionSource, STATIC_DIR: dir })).toThrow(/STATIC_DIR/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts a production STATIC_DIR that holds an index.html, and a missing one elsewhere', () => {
    const dir = mkdtempSync(join(tmpdir(), 'static-dir-'))
    try {
      writeFileSync(join(dir, 'index.html'), '<title>spa</title>')
      expect(loadEnv({ ...productionSource, STATIC_DIR: dir }).env.STATIC_DIR).toBe(dir)
      expect(loadEnv({ STATIC_DIR: join(dir, 'missing') }).env.STATIC_DIR).toBe(
        join(dir, 'missing'),
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
