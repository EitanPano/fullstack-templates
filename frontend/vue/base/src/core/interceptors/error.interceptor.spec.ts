import { describe, expect, it } from 'vitest'

import { errorInterceptor } from './error.interceptor'

const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message: 'server text that must never be kept', ...extra },
  requestId: 'req-1',
})

describe('errorInterceptor', () => {
  it('turns an envelope into an ApiError with its code, status and request id', () => {
    const result = errorInterceptor(envelope('not_found'), new Response(null, { status: 404 }))

    expect(result).toEqual({ code: 'not_found', status: 404, requestId: 'req-1' })
  })

  it('never keeps the server message', () => {
    const result = errorInterceptor(envelope('conflict'), new Response(null, { status: 409 }))

    expect(JSON.stringify(result)).not.toContain('server text')
  })

  it('falls back to the x-request-id header when the body has none', () => {
    const response = new Response(null, { status: 500, headers: { 'x-request-id': 'hdr-9' } })

    const result = errorInterceptor({ error: { code: 'internal', message: 'x' } }, response)

    expect(result.requestId).toBe('hdr-9')
  })

  it('maps a validation failure details list to field errors by path', () => {
    const details = [
      { path: 'email', message: 'x' },
      { path: 'items.1.label', message: 'y' },
    ]

    const result = errorInterceptor(
      envelope('validation_failed', { details }),
      new Response(null, { status: 422 }),
    )

    expect(result.code).toBe('validation_failed')
    expect(result.fieldErrors).toEqual({ email: ['invalid'], 'items.1.label': ['invalid'] })
  })

  it('drops unsafe and empty paths', () => {
    const details = [
      { path: '__proto__', message: 'x' },
      { path: 'a.constructor', message: 'x' },
      { path: '', message: 'x' },
      { path: 'ok', message: 'x' },
    ]

    const result = errorInterceptor(
      envelope('validation_failed', { details }),
      new Response(null, { status: 422 }),
    )

    expect(Object.keys(result.fieldErrors ?? {})).toEqual(['ok'])
  })

  it('gives no field errors to a validation failure without a details list', () => {
    const result = errorInterceptor(
      envelope('validation_failed'),
      new Response(null, { status: 422 }),
    )

    expect(result.fieldErrors).toBeUndefined()
  })

  it('maps a code the table does not know, and a body that is no envelope, to unknown', () => {
    const teapot = errorInterceptor(envelope('teapot'), new Response(null, { status: 418 }))
    const html = errorInterceptor('<html>bad gateway</html>', new Response(null, { status: 502 }))

    expect(teapot).toMatchObject({ code: 'unknown', status: 418 })
    expect(html).toMatchObject({ code: 'unknown', status: 502 })
  })

  it('maps a thrown fetch (no response) to network', () => {
    expect(errorInterceptor(new TypeError('Failed to fetch'), undefined)).toEqual({
      code: 'network',
    })
  })

  it('maps another thrown value without a response to unknown', () => {
    expect(errorInterceptor(new Error('boom'), undefined)).toEqual({ code: 'unknown' })
  })

  it('passes an ApiError thrown without a response through unchanged', () => {
    const error = { code: 'forbidden', status: 403 } as const

    expect(errorInterceptor(error, undefined)).toBe(error)
  })

  it('normalises a body with a string code that is not the envelope, keeping the status and request id', () => {
    const body = { code: 'forbidden', secret: 'kept?' }
    const response = new Response(null, { status: 502, headers: { 'x-request-id': 'req-1' } })

    expect(errorInterceptor(body, response)).toEqual({
      code: 'unknown',
      status: 502,
      requestId: 'req-1',
    })
  })
})
