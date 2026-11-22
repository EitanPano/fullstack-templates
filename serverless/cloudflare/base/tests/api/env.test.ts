import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import { getConfig, parseConfig as parseBindings, requireEncryptionKey } from '../../server/config/env'
import { json, send, through } from './helpers'
import { handle, json as jsonResponse } from '../../server/middleware/handler'

const KEY = btoa('0123456789abcdef0123456789abcdef')
// Beside several frontends every configuration needs the host map; tests of the other variables
// start from the development one.
// @frontends-start
const hosts = { FRONTEND_HOSTS: '__FRONTEND_HOSTS__' }
// @frontends-end
// @nofrontends-start
const hosts = {}
// @nofrontends-end
const parseConfig = (source: Record<string, unknown>) => parseBindings({ ...hosts, ...source })

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
    const bindings = { ...hosts, ENVIRONMENT: 'test' }
    expect(getConfig(bindings)).toBe(getConfig(bindings))
    expect(getConfig({ ...hosts, ENVIRONMENT: 'test' })).not.toBe(getConfig(bindings))
  })

  it('runs in production without a key, and writes no warning about it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(getConfig({ ...hosts, ENVIRONMENT: 'production' }).ENVIRONMENT).toBe('production')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('throws on an invalid key', () => {
    expect(() => getConfig({ ...hosts, ENVIRONMENT: 'production', ENCRYPTION_KEY: 'nope' })).toThrow(
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

// @frontends-start
describe('FRONTEND_HOSTS', () => {
  const dirs = (JSON.parse('__FRONTENDS__') as { dir: string }[]).map((frontend) => frontend.dir)
  const [first = '', second = ''] = dirs
  const all = dirs.map((dir) => `${dir}.localhost=${dir}`).join(',')
  const parse = (value: unknown, environment = 'test') =>
    parseBindings({ ENVIRONMENT: environment, FRONTEND_HOSTS: value })
  const message = (value: unknown) => {
    try {
      parse(value)
    } catch (error) {
      return (error as Error).message
    }
    return ''
  }

  it('maps each host to its frontend, in lower case, with the port left out of the comparison', () => {
    const map = parse(`${first.toUpperCase()}.Localhost=${first}, ${second}.localhost = ${second}`)
      .FRONTEND_HOSTS
    expect([...map]).toEqual([
      [`${first}.localhost`, first],
      [`${second}.localhost`, second],
    ])
    expect(parse(all).FRONTEND_HOSTS.size).toBe(dirs.length)
  })

  it('lets a frontend have several hosts', () => {
    const map = parse(`${all},www.example.com=${first}`).FRONTEND_HOSTS
    expect(map.get('www.example.com')).toBe(first)
    expect(map.get(`${first}.localhost`)).toBe(first)
  })

  it('is the development map of the run, in every environment', () => {
    for (const environment of ['development', 'test', 'preview', 'production']) {
      expect(parse(all, environment).FRONTEND_HOSTS.get(`${first}.localhost`)).toBe(first)
    }
    expect(parseBindings({ ...env, ENVIRONMENT: 'test' }).FRONTEND_HOSTS.get(`${second}.localhost`)).toBe(
      second,
    )
  })

  it('is required in every environment: missing, empty and blank are configuration errors', () => {
    for (const environment of ['development', 'test', 'preview', 'production']) {
      for (const value of [undefined, '', '   ', ' , ']) {
        expect(() => parse(value, environment)).toThrow(/FRONTEND_HOSTS/)
      }
    }
  })

  it.each([
    ['an entry without a dir', (a: string) => `x.localhost,${a}`, /host=dir/],
    ['an entry without a host', (a: string) => `=${a}`, /host=dir/],
    ['an entry with two equals signs', (a: string) => `x.localhost=${a}=${a}`, /host=dir/],
    ['a host with a port', (a: string) => `x.localhost:8788=${a}`, /without a port/],
    ['a host with a path', (a: string) => `x.localhost/a=${a}`, /without a port or a path/],
    ['a host with a space', (a: string) => `x y.localhost=${a}`, /without a port/],
    ['a dir that is not a frontend', () => 'x.localhost=nothing-here', /does not have/],
    ['a host twice', (a: string) => `x.localhost=${a},X.LOCALHOST=${a}`, /host twice/],
  ])('refuses %s, naming the variable and never the value', (_what, build, says) => {
    const value = build(first)
    const text = message(`${all},${value}`)
    expect(text).toMatch(/FRONTEND_HOSTS/)
    expect(text).toMatch(says)
    expect(text).not.toContain(value)
  })

  it('refuses a map that leaves a frontend without a host, naming it', () => {
    const text = message(`${first}.localhost=${first}`)
    expect(text).toMatch(new RegExp(`has no host for ${second}`))
  })

  it('stops a request with a bare 500 when the map is invalid, whatever the path', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const probe = handle(() => jsonResponse({ ok: true }))
    const res = await through(probe, '/probe', { bindings: { ...env, FRONTEND_HOSTS: '' } })
    expect(res.status).toBe(500)
    expect(JSON.parse(await res.text())).toMatchObject({ error: { code: 'internal' } })
    expect(String(error.mock.calls[0]?.[0])).toContain('FRONTEND_HOSTS')
    error.mockRestore()
  })
})
// @frontends-end
// @nofrontends-start
describe('FRONTEND_HOSTS with one frontend or none', () => {
  it('does not exist: no map is required and a value given is left out of the configuration', () => {
    expect(parseConfig({ ENVIRONMENT: 'production' })).not.toHaveProperty('FRONTEND_HOSTS')
    expect(parseConfig({ ENVIRONMENT: 'production', FRONTEND_HOSTS: 'a=b' })).not.toHaveProperty(
      'FRONTEND_HOSTS',
    )
    expect(Object.keys(env)).not.toContain('FRONTEND_HOSTS')
  })
})
// @nofrontends-end

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
