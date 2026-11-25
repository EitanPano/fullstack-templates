// SDK_KEYS, SDK_ENABLED and the key resolver. A malformed SDK_KEYS stops the request naming the
// variable, never the key; an origin goes into a response header, so each is a closed form.
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { parseConfig as parseBindings } from '../../server/config/env'
import { isListedOrigin, originsForKey } from '../../server/services/security/sdk-keys'

const A = 'https://a.example.test'
const B = 'https://b.example.test'
const C = 'http://localhost:5190'

const parseConfig = (source: Record<string, unknown>) => parseBindings({ ...env, ...source })
const resolverConfig = (keys: string | undefined) => parseConfig({ SDK_KEYS: keys })

describe('SDK_KEYS parsing', () => {
  it('is unset when absent or blank, so the resolver knows no key', () => {
    expect(parseConfig({ SDK_KEYS: undefined }).SDK_KEYS).toBeUndefined()
    expect(parseConfig({ SDK_KEYS: '' }).SDK_KEYS).toBeUndefined()
    expect(parseConfig({ SDK_KEYS: '   ' }).SDK_KEYS).toBeUndefined()
  })

  it('reads several pairs with several origins, ignoring spaces and a trailing semicolon', () => {
    const config = parseConfig({ SDK_KEYS: ` pk_a = ${A} , ${B} ; pk_b=${C};` })

    expect(config.SDK_KEYS).toEqual(
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
      const attempt = () => parseConfig({ SDK_KEYS: text })

      expect(attempt).toThrow(/SDK_KEYS/)
      expect(attempt).not.toThrow(/pk_probe/)
    })
  }

  it('reads SDK_ENABLED as true by default, false only when told, and refuses other text', () => {
    expect(parseConfig({ SDK_ENABLED: undefined }).SDK_ENABLED).toBe(true)
    expect(parseConfig({ SDK_ENABLED: '' }).SDK_ENABLED).toBe(true)
    expect(parseConfig({ SDK_ENABLED: 'true' }).SDK_ENABLED).toBe(true)
    expect(parseConfig({ SDK_ENABLED: 'false' }).SDK_ENABLED).toBe(false)
    expect(() => parseConfig({ SDK_ENABLED: 'no' })).toThrow(/SDK_ENABLED/)
  })

  it('takes a JSON boolean for SDK_ENABLED, which wrangler.jsonc vars may hold', () => {
    expect(parseConfig({ SDK_ENABLED: false }).SDK_ENABLED).toBe(false)
    expect(parseConfig({ SDK_ENABLED: true }).SDK_ENABLED).toBe(true)
  })
})

describe('the key resolver', () => {
  it('gives the origins of a known key and nothing for an unknown, empty or missing one', () => {
    const config = resolverConfig(`pk_a=${A},${B}`)

    expect(originsForKey(config, 'pk_a')).toEqual([A, B])
    expect(originsForKey(config, 'pk_other')).toBeUndefined()
    expect(originsForKey(config, '')).toBeUndefined()
    expect(originsForKey(config, undefined)).toBeUndefined()
  })

  it('does not resolve an inherited object property as a key', () => {
    const config = resolverConfig(`pk_a=${A}`)

    expect(originsForKey(config, '__proto__')).toBeUndefined()
    expect(originsForKey(config, 'constructor')).toBeUndefined()
  })

  it('knows no key and no origin while SDK_KEYS is unset', () => {
    const config = resolverConfig(undefined)

    expect(originsForKey(config, 'pk_a')).toBeUndefined()
    expect(isListedOrigin(config, A)).toBe(false)
  })

  it('lists an origin when any key lists it', () => {
    const config = resolverConfig(`pk_a=${A};pk_b=${B}`)

    expect(isListedOrigin(config, A)).toBe(true)
    expect(isListedOrigin(config, B)).toBe(true)
    expect(isListedOrigin(config, 'https://c.example.test')).toBe(false)
    expect(isListedOrigin(config, undefined)).toBe(false)
  })
})
