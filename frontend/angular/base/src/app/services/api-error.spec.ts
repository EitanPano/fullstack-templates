import { ApiError, isApiError } from './api-error'

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
