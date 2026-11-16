import { describe, expect, it } from 'vitest'

import { byBodyPath, byBodyString, scaledLimit } from '../../server/middleware/rate-limit'
import type { Context } from '../../server/middleware/handler'

describe('scaledLimit', () => {
  it('refuses a scale below 1, above 1000 or not finite, so no value disables limiting', () => {
    for (const scale of [0, 0.5, -1, 1001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => scaledLimit(10, scale)).toThrow(RangeError)
    }
  })

  it('leaves the limit alone at scale 1 and multiplies it above', () => {
    expect(scaledLimit(10, 1)).toBe(10)
    expect(scaledLimit(10, 100)).toBe(1000)
  })

  it('rounds a fractional result up, so a scale never lowers a limit', () => {
    expect(scaledLimit(3, 1.5)).toBe(5)
    expect(scaledLimit(10, 1.1)).toBe(11)
  })
})

// The limiter runs before validate, so the body is unparsed JSON text read by the key function.
const ctxWith = async (body: unknown): Promise<Context> =>
  ({
    request: new Request('http://x/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  }) as Context

describe('byBodyString', () => {
  it('trims and lower-cases a string field', async () => {
    expect(await byBodyString('email')(await ctxWith({ email: '  Ada@Example.COM ' }))).toBe(
      'ada@example.com',
    )
  })

  it('returns undefined for a missing or non-string field and for a body that is not an object', async () => {
    const key = byBodyString('email')
    expect(await key(await ctxWith({}))).toBeUndefined()
    expect(await key(await ctxWith({ email: 5 }))).toBeUndefined()
    expect(await key(await ctxWith('[1]'))).toBeUndefined()
    expect(await key(await ctxWith('{not json'))).toBeUndefined()
  })
})

describe('byBodyPath', () => {
  it('reads a nested string, trimmed and lower-cased', async () => {
    expect(await byBodyPath('target', 'value')(await ctxWith({ target: { value: ' X ' } }))).toBe(
      'x',
    )
  })

  it('returns undefined for a missing path or a leaf that is not a string', async () => {
    const key = byBodyPath('target', 'value')
    expect(await key(await ctxWith({ target: 1 }))).toBeUndefined()
    expect(await key(await ctxWith({ target: { value: 1 } }))).toBeUndefined()
  })
})
