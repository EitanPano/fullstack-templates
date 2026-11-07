import { afterEach, describe, expect, it, vi } from 'vitest'

import { call, DEFAULT_COPY } from '@/services/call'

// `call` turns the generated client's result into `{ data }` or `{ error }` carrying copy we wrote.
// The results below have the shape of the generated client's: { data, error, response }.
const envelope = (
  code: string,
  message = 'server text: db password hunter2',
  details?: unknown,
) => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
  requestId: 'req-1',
})
const failure = (status: number, error: unknown) =>
  Promise.resolve({
    data: undefined,
    error,
    response: new Response(null, { status }),
  })
const success = <T>(data: T, status = 200) =>
  Promise.resolve({ data, error: undefined, response: new Response(null, { status }) })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('call', () => {
  it('returns the data of a success', async () => {
    await expect(call(success({ id: 'u1' }))).resolves.toEqual({ data: { id: 'u1' } })
  })

  it('returns undefined data for a 204', async () => {
    const result = await call(
      Promise.resolve({
        data: undefined,
        error: undefined,
        response: new Response(null, { status: 204 }),
      }),
    )

    expect(result).toEqual({ data: undefined })
  })

  it.each([
    ['validation_failed', 400],
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['conflict', 409],
    ['payload_too_large', 413],
    ['unsupported_media_type', 415],
    ['rate_limited', 429],
    ['internal', 500],
    ['upstream_unavailable', 503],
  ] as const)(
    'maps %s (%i) to its default copy and never the server text',
    async (code, status) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const result = await call(failure(status, envelope(code)))

      expect(result).toEqual({
        error: { code, status, message: DEFAULT_COPY[code], requestId: 'req-1' },
      })
      expect(JSON.stringify(result)).not.toContain('hunter2')
    },
  )

  it('maps a status with no envelope to its code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    for (const [status, code] of [
      [502, 'upstream_unavailable'],
      [504, 'upstream_unavailable'],
      [404, 'not_found'],
      [418, 'internal'],
    ] as const) {
      const result = await call(failure(status, '<html>Bad gateway</html>'))

      expect(result).toMatchObject({ error: { code, message: DEFAULT_COPY[code], status } })
    }
  })

  it('lets the envelope code win over the status', async () => {
    const result = await call(failure(400, envelope('conflict')))

    expect(result).toMatchObject({ error: { code: 'conflict', status: 400 } })
  })

  it('carries the envelope details, raw, for a product discriminator', async () => {
    const result = await call(failure(409, envelope('conflict', 'x', { reason: 'slot_taken' })))

    expect(result).toMatchObject({ error: { details: { reason: 'slot_taken' } } })
  })

  it('logs a 5xx with its request id and returns a generic message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await call(failure(500, envelope('internal')))

    expect(result).toMatchObject({ error: { message: DEFAULT_COPY.internal, status: 500 } })
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[api]'),
      expect.objectContaining({ requestId: 'req-1' }),
    )
  })

  it('does not log an expected 4xx that carries an envelope', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await call(failure(409, envelope('conflict')))

    expect(log).not.toHaveBeenCalled()
  })

  it('reports an unreachable API when there is no response, before trusting the error type', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // The generated client returns the thrown value as `error` and no response.
    const cause = new TypeError('fetch failed')

    const result = await call(Promise.resolve({ data: undefined, error: cause }))

    expect(result).toEqual({ error: { code: 'network', message: DEFAULT_COPY.network } })
    expect(log).toHaveBeenCalled()
  })

  it('treats a rejected request as a network failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await call(Promise.reject(new Error('ECONNREFUSED')))

    expect(result).toEqual({ error: { code: 'network', message: DEFAULT_COPY.network } })
  })
})

describe('call and form fields', () => {
  it('turns a 400 with details into field errors, with our copy', async () => {
    const result = await call(
      failure(
        400,
        envelope('validation_failed', 'bad', [{ path: 'email', message: 'Invalid: hunter2' }]),
      ),
    )

    expect(result).toMatchObject({
      error: { fieldErrors: { email: DEFAULT_COPY.validation_failed } },
    })
    // The raw details ride along for a discriminator; the copy the UI shows never includes them.
    expect(
      'error' in result && JSON.stringify([result.error.message, result.error.fieldErrors]),
    ).not.toContain('hunter2')
  })

  it('ignores a server-supplied path that would reach the prototype', async () => {
    const result = await call(
      failure(
        400,
        envelope('validation_failed', 'bad', [
          { path: '__proto__.polluted', message: 'x' },
          { path: 'constructor.prototype.polluted', message: 'x' },
          { path: 'email', message: 'x' },
        ]),
      ),
    )

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect('error' in result && Object.keys(result.error.fieldErrors ?? {})).toEqual(['email'])
  })

  it('has no field errors when a 400 has no details', async () => {
    const result = await call(failure(400, envelope('validation_failed')))

    expect(result).toMatchObject({
      error: { code: 'validation_failed', status: 400, message: DEFAULT_COPY.validation_failed },
    })
    expect(result).not.toHaveProperty('error.fieldErrors')
  })

  it('carries the request id of an envelope on the error', async () => {
    const result = await call(failure(409, envelope('conflict')))

    expect(result).toMatchObject({ error: { requestId: 'req-1' } })
  })
})
