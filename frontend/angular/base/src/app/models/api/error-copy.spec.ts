import en from '@app/core/i18n/translations/en.json'

import { ERROR_CODES, errorMessageKey } from './error-copy'
import { ApiError, isApiError } from './response'

describe('error copy', () => {
  it('has a message in en.json for every code, and for the shared fallbacks', () => {
    for (const code of ERROR_CODES) {
      expect(en.errors, `errors.${code}`).toHaveProperty(code)
    }
    for (const key of ['unknown', 'network', 'offline', 'unexpected']) {
      expect(en.errors).toHaveProperty(key)
    }
  })

  it('maps a code to its key and any other string to errors.unknown', () => {
    expect(errorMessageKey('conflict')).toBe('errors.conflict')
    expect(errorMessageKey('network')).toBe('errors.network')
    expect(errorMessageKey('teapot')).toBe('errors.unknown')
    expect(errorMessageKey('constructor')).toBe('errors.unknown')
  })
})

describe('ApiError', () => {
  it('carries status, code, request id and field errors, and is recognised by the guard', () => {
    const error = new ApiError({
      status: 400,
      code: 'validation_failed',
      requestId: 'r-1',
      fieldErrors: { email: ['invalid'] },
    })
    expect(isApiError(error)).toBe(true)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      status: 400,
      code: 'validation_failed',
      requestId: 'r-1',
      fieldErrors: { email: ['invalid'] },
    })
  })

  it('defaults the request id to null and rejects look-alikes', () => {
    expect(new ApiError({ status: 0, code: 'network' }).requestId).toBeNull()
    expect(isApiError({ status: 500, code: 'internal' })).toBe(false)
    expect(isApiError(new Error('x'))).toBe(false)
  })
})
