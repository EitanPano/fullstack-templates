import { afterEach, describe, expect, it } from 'bun:test'

import { env, loadEnv } from '../src/config/env'
import { isListedOrigin, resolveKey } from '../src/services/security/sdk-keys'

const A = 'https://a.example.test'
const B = 'https://b.example.test'
const C = 'http://localhost:5190'

describe('SDK_KEYS parsing', () => {
  it('is unset when absent or blank, so the resolver knows no key', () => {
    expect(loadEnv({}).env.SDK_KEYS).toBeUndefined()
    expect(loadEnv({ SDK_KEYS: '' }).env.SDK_KEYS).toBeUndefined()
    expect(loadEnv({ SDK_KEYS: '   ' }).env.SDK_KEYS).toBeUndefined()
  })

  it('reads several pairs with several origins, ignoring spaces and a trailing semicolon', () => {
    const { env: parsed } = loadEnv({
      SDK_KEYS: ` pk_a = ${A} , ${B} ; pk_b=${C};`,
    })

    expect(parsed.SDK_KEYS).toEqual(
      new Map([
        ['pk_a', [A, B]],
        ['pk_b', [C]],
      ]),
    )
  })

  // Each text carries the key `pk_probe`, which no message may repeat.
  const MALFORMED: Record<string, string> = {
    'a pair with no origin': 'pk_probe',
    'a pair with an empty origin list': 'pk_probe=',
    'a pair with two equals signs': `pk_probe=${A}=${B}`,
    'an empty key': `=${A}`,
    'a key with a character outside the set': `pk probe=${A}`,
    'a repeated key': `pk_probe=${A};pk_probe=${B}`,
    'an empty pair between two': `pk_probe=${A};;pk_b=${B}`,
    'a wildcard origin': 'pk_probe=*',
    'an origin with a path': `pk_probe=${A}/path`,
    'an origin with a trailing slash': `pk_probe=${A}/`,
    'an origin with a space inside': 'pk_probe=https://a.example.test x',
    'an origin that would end the header value': `pk_probe=${A} script-src *`,
    'an origin with a quote': `pk_probe=https://a.example.test'`,
    'an origin with upper-case letters': 'pk_probe=https://A.example.test',
    'an origin with the scheme missing': 'pk_probe=a.example.test',
    'an origin with another scheme': 'pk_probe=ftp://a.example.test',
    'an origin with a default port a browser never sends': 'pk_probe=https://a.example.test:443',
    'an origin with credentials': 'pk_probe=https://user@a.example.test',
    'an empty origin among two': `pk_probe=${A},`,
  }

  for (const [name, text] of Object.entries(MALFORMED)) {
    it(`refuses ${name}, naming SDK_KEYS and never the key`, () => {
      const attempt = () => loadEnv({ SDK_KEYS: text })

      expect(attempt).toThrow(/SDK_KEYS/)
      expect(attempt).not.toThrow(/pk_probe/)
    })
  }

  // Every other production requirement met, so only the origin can be refused.
  const PRODUCTION = {
    NODE_ENV: 'production',
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    JWT_ACCESS_SECRET: 'prod-access-' + 'a'.repeat(32), // @auth
    JWT_REFRESH_SECRET: 'prod-refresh-' + 'b'.repeat(32), // @auth
    OTP_SECRET: 'prod-otp-' + 'c'.repeat(32), // @auth
    DATABASE_URL: 'postgres://app:prodpass@db.internal:5432/app', // @database:postgres
  }

  it('refuses an http origin in production', () => {
    const attempt = () => loadEnv({ ...PRODUCTION, SDK_KEYS: 'pk_probe=http://a.example.test' })

    expect(attempt).toThrow(/SDK_KEYS: pair 1/)
    expect(attempt).not.toThrow(/pk_probe/)
  })

  it('refuses a loopback origin in production', () => {
    for (const origin of [
      'https://localhost:5190',
      'https://127.0.0.1',
      'https://127.1.2.3:8443',
    ]) {
      const attempt = () => loadEnv({ ...PRODUCTION, SDK_KEYS: `pk_a=${A};pk_probe=${origin}` })

      expect(attempt).toThrow(/SDK_KEYS: pair 2/)
      expect(attempt).not.toThrow(/pk_probe/)
    }
  })

  it('accepts both outside production', () => {
    const text = 'pk_a=http://localhost:5190,http://127.0.0.1:5190,https://localhost'

    for (const NODE_ENV of ['development', 'test']) {
      expect(loadEnv({ NODE_ENV, SDK_KEYS: text }).env.SDK_KEYS?.get('pk_a')).toHaveLength(3)
    }
    expect(loadEnv({ ...PRODUCTION, SDK_KEYS: `pk_a=${A}` }).env.SDK_KEYS?.get('pk_a')).toEqual([A])
  })

  it('reads SDK_IMG_ORIGINS as a list, empty when blank or unset', () => {
    expect(loadEnv({}).env.SDK_IMG_ORIGINS).toEqual([])
    expect(loadEnv({ SDK_IMG_ORIGINS: '  ' }).env.SDK_IMG_ORIGINS).toEqual([])
    expect(loadEnv({ SDK_IMG_ORIGINS: `${A}, ${B}` }).env.SDK_IMG_ORIGINS).toEqual([A, B])
  })

  it('refuses a malformed SDK_IMG_ORIGINS, naming the variable', () => {
    for (const text of ['*', `${A}/path`, 'https://A.example.test', `${A},`, `${A} img-src *`]) {
      expect(() => loadEnv({ SDK_IMG_ORIGINS: text })).toThrow(/SDK_IMG_ORIGINS/)
    }
  })

  it('refuses an http or loopback image origin in production only', () => {
    for (const origin of ['http://a.example.test', 'https://localhost', 'https://127.0.0.1:8443']) {
      expect(() => loadEnv({ ...PRODUCTION, SDK_IMG_ORIGINS: origin })).toThrow(/SDK_IMG_ORIGINS/)
      const parsed = loadEnv({ NODE_ENV: 'development', SDK_IMG_ORIGINS: origin })
      expect(parsed.env.SDK_IMG_ORIGINS).toEqual([origin])
    }
    expect(loadEnv({ ...PRODUCTION, SDK_IMG_ORIGINS: A }).env.SDK_IMG_ORIGINS).toEqual([A])
  })

  it('treats a blank SDK_DIR as unset and resolves a set one to an absolute path', () => {
    expect(loadEnv({ SDK_DIR: '' }).env.SDK_DIR).toBeUndefined()
    expect(loadEnv({ SDK_DIR: 'dist/cdn' }).env.SDK_DIR).toMatch(/dist[\\/]cdn$/)
  })

  it('reads SDK_ENABLED as true by default, false only when told, and refuses other text', () => {
    expect(loadEnv({}).env.SDK_ENABLED).toBe(true)
    expect(loadEnv({ SDK_ENABLED: '' }).env.SDK_ENABLED).toBe(true)
    expect(loadEnv({ SDK_ENABLED: 'false' }).env.SDK_ENABLED).toBe(false)
    expect(() => loadEnv({ SDK_ENABLED: 'no' })).toThrow(/SDK_ENABLED/)
  })
})

describe('the key resolver', () => {
  const original = env.SDK_KEYS
  afterEach(() => {
    env.SDK_KEYS = original
  })

  it('gives the record of a known key and nothing for an unknown, empty or missing one', async () => {
    env.SDK_KEYS = new Map([['pk_a', [A, B]]])

    expect(await resolveKey('pk_a')).toEqual({ origins: [A, B], enabled: true })
    expect(await resolveKey('pk_other')).toBeUndefined()
    expect(await resolveKey('')).toBeUndefined()
    expect(await resolveKey(undefined)).toBeUndefined()
  })

  it('does not resolve an inherited object property as a key', async () => {
    env.SDK_KEYS = new Map([['pk_a', [A]]])

    expect(await resolveKey('__proto__')).toBeUndefined()
    expect(await resolveKey('constructor')).toBeUndefined()
  })

  it('knows no key and no origin while SDK_KEYS is unset', async () => {
    env.SDK_KEYS = undefined

    expect(await resolveKey('pk_a')).toBeUndefined()
    expect(await isListedOrigin(A)).toBe(false)
  })

  it('lists an origin when any key lists it', async () => {
    env.SDK_KEYS = new Map([
      ['pk_a', [A]],
      ['pk_b', [B]],
    ])

    expect(await isListedOrigin(A)).toBe(true)
    expect(await isListedOrigin(B)).toBe(true)
    expect(await isListedOrigin('https://c.example.test')).toBe(false)
    expect(await isListedOrigin(undefined)).toBe(false)
  })
})
