import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { getConfig, parseConfig, requireEncryptionKey } from '../../server/config/env'
import { json, send, through } from './helpers'
import { handle, json as jsonResponse } from '../../server/middleware/handler'

const KEY = btoa('0123456789abcdef0123456789abcdef')

describe('parseConfig', () => {
  it('parses the bindings the test run gives the worker, with the defaults and no key', () => {
    const config = parseConfig({ ...env, ENVIRONMENT: 'test' })
    expect(config.ENVIRONMENT).toBe('test')
    expect(config.RATE_LIMIT_SCALE).toBe(1)
    expect(config.LOG_LEVEL).toBe('info')
    expect(config.ENCRYPTION_KEY).toBeUndefined()
  })

  it('treats a blank value as unset', () => {
    const config = parseConfig({
      ENVIRONMENT: 'development',
      RATE_LIMIT_SCALE: ' ',
      LOG_LEVEL: '',
      ENCRYPTION_KEY: '  ',
    })
    expect(config.RATE_LIMIT_SCALE).toBe(1)
    expect(config.LOG_LEVEL).toBe('info')
    expect(config.ENCRYPTION_KEY).toBeUndefined()
  })

  it('refuses a missing or unknown ENVIRONMENT, naming the variable', () => {
    expect(() => parseConfig({})).toThrow(/ENVIRONMENT/)
    expect(() => parseConfig({ ENVIRONMENT: 'staging' })).toThrow(/ENVIRONMENT/)
  })

  it('refuses a RATE_LIMIT_SCALE outside 1 to 1000, so no value disables limiting', () => {
    for (const scale of ['0', '0.5', '1001', 'abc', '-3']) {
      expect(() => parseConfig({ ENVIRONMENT: 'development', RATE_LIMIT_SCALE: scale })).toThrow(
        /RATE_LIMIT_SCALE/,
      )
    }
    expect(parseConfig({ ENVIRONMENT: 'test', RATE_LIMIT_SCALE: '100' }).RATE_LIMIT_SCALE).toBe(
      100,
    )
  })

  it('leaves the key optional in every environment, with no default', () => {
    for (const environment of ['development', 'test', 'preview', 'production']) {
      expect(parseConfig({ ENVIRONMENT: environment }).ENCRYPTION_KEY).toBeUndefined()
    }
  })

  it('keeps a valid key in every environment', () => {
    for (const environment of ['development', 'test', 'preview', 'production']) {
      expect(parseConfig({ ENVIRONMENT: environment, ENCRYPTION_KEY: KEY }).ENCRYPTION_KEY).toBe(
        KEY,
      )
    }
  })

  it('refuses an invalid key in every environment, naming it and never printing its value', () => {
    for (const environment of ['development', 'test', 'preview', 'production']) {
      for (const bad of [
        'change-me-base64-of-32-random-bytes',
        btoa('too-short'),
        '!!not-base64!!',
      ]) {
        let message = ''
        try {
          parseConfig({ ENVIRONMENT: environment, ENCRYPTION_KEY: bad })
        } catch (error) {
          message = (error as Error).message
        }
        expect(message).toMatch(/ENCRYPTION_KEY/)
        expect(message).not.toContain(bad)
      }
    }
  })
})

describe('getConfig', () => {
  it('parses once per bindings object', () => {
    const bindings = { ENVIRONMENT: 'test' }
    expect(getConfig(bindings)).toBe(getConfig(bindings))
    expect(getConfig({ ENVIRONMENT: 'test' })).not.toBe(getConfig(bindings))
  })

  it('runs in production without a key, and writes no warning about it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(getConfig({ ENVIRONMENT: 'production' }).ENVIRONMENT).toBe('production')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('throws on an invalid key', () => {
    expect(() => getConfig({ ENVIRONMENT: 'production', ENCRYPTION_KEY: 'nope' })).toThrow(
      /ENCRYPTION_KEY/,
    )
  })
})

describe('requireEncryptionKey', () => {
  it('returns the key when it is set', () => {
    expect(requireEncryptionKey(parseConfig({ ENVIRONMENT: 'test', ENCRYPTION_KEY: KEY }))).toBe(KEY)
  })

  it('throws the configuration error when it is not set', () => {
    const config = parseConfig({ ENVIRONMENT: 'test' })
    expect(() => requireEncryptionKey(config)).toThrow('invalid environment: ENCRYPTION_KEY is not set')
  })
})

describe('a run with no key, as .env.example leaves it', () => {
  const probe = handle((ctx) => jsonResponse({ environment: ctx.env.ENVIRONMENT }))

  it('serves /api/health and /api/health/ready', async () => {
    expect((env as unknown as Record<string, unknown>).ENCRYPTION_KEY).toBeUndefined()
    const health = await send('/api/health')
    expect(health.status).toBe(200)
    expect(await json(health)).toMatchObject({ status: 'ok' })
    expect((await send('/api/health/ready')).status).toBe(200)
  })

  it('serves a production request without a key', async () => {
    const res = await through(probe, '/probe', { bindings: { ...env, ENVIRONMENT: 'production' } })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ environment: 'production' })
  })
})
