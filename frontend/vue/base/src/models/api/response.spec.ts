import { describe, expect, it } from 'vitest'

import { isApiError, toApiError } from './response'

describe('isApiError', () => {
  it('accepts an object with a string code', () => {
    expect(isApiError({ code: 'not_found', status: 404 })).toBe(true)
  })

  it.each([null, undefined, 'not_found', 42, {}, { code: 7 }, new Error('x')])(
    'refuses %j',
    (value) => {
      expect(isApiError(value)).toBe(false)
    },
  )
})

describe('toApiError', () => {
  it('returns an ApiError unchanged', () => {
    const error = { code: 'conflict', status: 409, requestId: 'r1' } as const

    expect(toApiError(error)).toBe(error)
  })

  it('turns a thrown fetch (a TypeError) into the network code', () => {
    expect(toApiError(new TypeError('Failed to fetch'))).toEqual({ code: 'network' })
  })

  it('carries the context of a converted cause and nothing else', () => {
    expect(toApiError(new TypeError('x'), 'health.load')).toEqual({
      code: 'network',
      context: 'health.load',
    })
    expect(toApiError(new Error('x'), 'health.load')).toEqual({
      code: 'unknown',
      context: 'health.load',
    })
  })

  it('turns anything else into unknown, keeping nothing of its text', () => {
    expect(toApiError(new Error('boom: select * from user'))).toEqual({ code: 'unknown' })
    expect(toApiError('x')).toEqual({ code: 'unknown' })
  })
})
