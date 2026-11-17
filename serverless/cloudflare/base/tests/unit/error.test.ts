import { describe, expect, it } from 'vitest'

import {
  AppError,
  ERROR_CODES,
  toErrorBody,
} from '../../server/services/utils/error'

describe('AppError', () => {
  it('maps every code to the status of its row', () => {
    const expected = {
      validation_failed: 400,
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      method_not_allowed: 405,
      conflict: 409,
      payload_too_large: 413,
      unsupported_media_type: 415,
      rate_limited: 429,
      internal: 500,
      upstream_unavailable: 503,
    }
    expect(Object.keys(expected).sort()).toEqual([...ERROR_CODES].sort())
    for (const code of ERROR_CODES) expect(new AppError(code, 'x').status).toBe(expected[code])
  })

  it('carries details and headers', () => {
    const error = new AppError('validation_failed', 'bad', [{ path: 'a', message: 'b' }], {
      headers: { 'Retry-After': '3' },
    })
    expect(error.details).toEqual([{ path: 'a', message: 'b' }])
    expect(error.headers).toEqual({ 'Retry-After': '3' })
  })
})

describe('toErrorBody', () => {
  it('builds the envelope and leaves details out when there are none', () => {
    expect(toErrorBody(new AppError('not_found', 'gone'), 'rid')).toEqual({
      error: { code: 'not_found', message: 'gone' },
      requestId: 'rid',
    })
    expect(toErrorBody(new AppError('conflict', 'x', { a: 1 }), 'rid').error.details).toEqual({
      a: 1,
    })
  })
})
