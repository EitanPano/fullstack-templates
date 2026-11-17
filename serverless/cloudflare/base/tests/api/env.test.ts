import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { getConfig, parseConfig } from '../../server/config/env'

const KEY = btoa('0123456789abcdef0123456789abcdef')

describe('parseConfig', () => {
  it('parses the bindings the test run gives the worker, with the defaults', () => {
    const { config, defaulted } = parseConfig({ ...env, ENVIRONMENT: 'test' })
    expect(config.ENVIRONMENT).toBe('test')
    expect(config.RATE_LIMIT_SCALE).toBe(1)
    expect(config.LOG_LEVEL).toBe('info')
    expect(defaulted).toEqual(['ENCRYPTION_KEY'])
  })

  it('treats a blank value as unset', () => {
    const { config } = parseConfig({
      ENVIRONMENT: 'development',
      RATE_LIMIT_SCALE: ' ',
      LOG_LEVEL: '',
    })
    expect(config.RATE_LIMIT_SCALE).toBe(1)
    expect(config.LOG_LEVEL).toBe('info')
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
    expect(
      parseConfig({ ENVIRONMENT: 'test', RATE_LIMIT_SCALE: '100' }).config.RATE_LIMIT_SCALE,
    ).toBe(100)
  })

  it('defaults a missing secret outside production and reports it', () => {
    for (const environment of ['development', 'test', 'preview']) {
      const { config, defaulted } = parseConfig({ ENVIRONMENT: environment })
      expect(defaulted).toEqual(['ENCRYPTION_KEY'])
      expect(atob(config.ENCRYPTION_KEY)).toHaveLength(32)
    }
  })

  it('keeps a secret that is set', () => {
    const { config, defaulted } = parseConfig({ ENVIRONMENT: 'development', ENCRYPTION_KEY: KEY })
    expect(config.ENCRYPTION_KEY).toBe(KEY)
    expect(defaulted).toEqual([])
  })
})

describe('parseConfig in production', () => {
  it('accepts a strong secret', () => {
    const { config, defaulted } = parseConfig({ ENVIRONMENT: 'production', ENCRYPTION_KEY: KEY })
    expect(config.ENVIRONMENT).toBe('production')
    expect(defaulted).toEqual([])
  })

  it('refuses a missing secret and names the variable', () => {
    expect(() => parseConfig({ ENVIRONMENT: 'production' })).toThrow(/ENCRYPTION_KEY/)
    expect(() => parseConfig({ ENVIRONMENT: 'production', ENCRYPTION_KEY: '' })).toThrow(
      /ENCRYPTION_KEY/,
    )
  })

  it('refuses a placeholder or a weak secret without printing its value', () => {
    for (const weak of [
      'change-me-base64-of-32-random-bytes',
      btoa('too-short'),
      '!!not-base64!!',
    ]) {
      let message = ''
      try {
        parseConfig({ ENVIRONMENT: 'production', ENCRYPTION_KEY: weak })
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).toMatch(/ENCRYPTION_KEY/)
      expect(message).not.toContain(weak)
    }
  })
})

describe('getConfig', () => {
  it('parses once per bindings object', () => {
    const bindings = { ENVIRONMENT: 'test' }
    expect(getConfig(bindings)).toBe(getConfig(bindings))
    expect(getConfig({ ENVIRONMENT: 'test' })).not.toBe(getConfig(bindings))
  })

  it('warns once about a defaulted secret, naming it, and never about a set one', () => {
    const warn = vi.fn()
    const bindings = { ENVIRONMENT: 'development' }
    getConfig(bindings, warn)
    getConfig(bindings, warn)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('ENCRYPTION_KEY')

    warn.mockClear()
    getConfig({ ENVIRONMENT: 'development', ENCRYPTION_KEY: KEY }, warn)
    expect(warn).not.toHaveBeenCalled()
  })

  it('throws in production without the secret', () => {
    expect(() => getConfig({ ENVIRONMENT: 'production' })).toThrow(/ENCRYPTION_KEY/)
  })
})
