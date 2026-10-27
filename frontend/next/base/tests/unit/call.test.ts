import { z } from 'zod'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { call, DEFAULT_COPY } from '@/shared/api/call'
import { ActionError } from '@/shared/lib/action-error'
import { action } from '@/shared/lib/safe-action'

// `call` turns the generated client's result into data or an ActionError carrying copy we wrote.
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
    await expect(call(success({ id: 'u1' }))).resolves.toEqual({ id: 'u1' })
  })

  it('returns undefined for a 204', async () => {
    await expect(
      call(
        Promise.resolve({
          data: undefined,
          error: undefined,
          response: new Response(null, { status: 204 }),
        }),
      ),
    ).resolves.toBeUndefined()
  })

  it.each([
    ['unauthenticated', 401, DEFAULT_COPY.unauthenticated],
    ['forbidden', 403, DEFAULT_COPY.forbidden],
    ['not_found', 404, DEFAULT_COPY.not_found],
    ['conflict', 409, DEFAULT_COPY.conflict],
    ['rate_limited', 429, DEFAULT_COPY.rate_limited],
    ['validation_failed', 400, DEFAULT_COPY.validation_failed],
  ])('maps %s (%i) to the default copy and never the server text', async (code, status, copy) => {
    const error = await call(failure(status, envelope(code))).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ActionError)
    expect(error).toMatchObject({ message: copy, code, status })
    expect((error as Error).message).not.toContain('hunter2')
  })

  it('prefers the feature copy table over the default, keyed by code', async () => {
    const error = await call(failure(409, envelope('conflict')), {
      conflict: 'That email is already registered.',
    }).catch((e: unknown) => e)

    expect(error).toMatchObject({ message: 'That email is already registered.' })
  })

  it('prefers a second-key entry when the product passes a discriminator', async () => {
    const copy = { conflict: 'Conflict.', 'conflict:slot_taken': 'That slot is taken.' }
    const body = envelope('conflict', 'x', { reason: 'slot_taken' })
    const discriminator = (e: { error: { details?: unknown } }) =>
      (e.error.details as { reason?: string } | undefined)?.reason

    await expect(call(failure(409, body), copy, { discriminator })).rejects.toMatchObject({
      message: 'That slot is taken.',
    })
    await expect(
      call(failure(409, envelope('conflict')), copy, { discriminator }),
    ).rejects.toMatchObject({ message: 'Conflict.' })
  })

  it('logs a 5xx with its request id and returns a generic message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(call(failure(500, envelope('internal')))).rejects.toMatchObject({
      message: DEFAULT_COPY.internal,
      status: 500,
    })
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[api]'),
      expect.objectContaining({ requestId: 'req-1' }),
    )
  })

  it('reports an unreachable API when there is no response, before trusting the error type', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // The generated client returns the thrown value as `error` and no response.
    const cause = new TypeError('fetch failed')

    await expect(call(Promise.resolve({ data: undefined, error: cause }))).rejects.toMatchObject({
      message: DEFAULT_COPY.network,
    })
    expect(log).toHaveBeenCalled()
  })

  it('treats a rejected request the same as a missing response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(call(Promise.reject(new Error('ECONNREFUSED')))).rejects.toMatchObject({
      message: DEFAULT_COPY.network,
    })
  })

  it('falls back to the status class when the body is not an envelope (a proxy error page)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(call(failure(502, '<html>Bad gateway</html>'))).rejects.toMatchObject({
      message: DEFAULT_COPY.upstream_unavailable,
      status: 502,
    })
    await expect(call(failure(404, ''))).rejects.toMatchObject({ message: DEFAULT_COPY.not_found })
    await expect(call(failure(418, {}))).rejects.toMatchObject({ message: DEFAULT_COPY.internal })
  })
})

describe('call with an input schema', () => {
  const schema = z.object({ email: z.string(), password: z.string() })
  const input = { email: 'a@b.co', password: 'pw' }

  it('turns a 400 with details into errors on those fields, with our copy', async () => {
    const result = await action
      .inputSchema(schema)
      .action(() =>
        call(
          failure(
            400,
            envelope('validation_failed', 'bad', [{ path: 'email', message: 'Invalid: hunter2' }]),
          ),
          {},
          { schema },
        ),
      )(input)

    expect(result.validationErrors).toEqual({
      email: { _errors: [DEFAULT_COPY.validation_failed] },
    })
    expect(JSON.stringify(result)).not.toContain('hunter2')
  })

  it('uses a per-field entry of the copy table when there is one', async () => {
    const result = await action
      .inputSchema(schema)
      .action(() =>
        call(
          failure(400, envelope('validation_failed', 'bad', [{ path: 'password', message: 'x' }])),
          { 'validation_failed:password': 'Use a longer password.' },
          { schema },
        ),
      )(input)

    expect(result.validationErrors).toEqual({ password: { _errors: ['Use a longer password.'] } })
  })

  it('puts a mapped code on its field instead of throwing', async () => {
    const result = await action
      .inputSchema(schema)
      .action(() =>
        call(
          failure(409, envelope('conflict')),
          { conflict: 'Already registered.' },
          { schema, fields: { conflict: 'email' } },
        ),
      )(input)

    expect(result.validationErrors).toEqual({ email: { _errors: ['Already registered.'] } })
    expect(result.serverError).toBeUndefined()
  })

  it('ignores a server-supplied path that would reach the prototype', async () => {
    const result = await action.inputSchema(schema).action(() =>
      call(
        failure(
          400,
          envelope('validation_failed', 'bad', [
            { path: '__proto__.polluted', message: 'x' },
            { path: 'constructor.prototype.polluted', message: 'x' },
            { path: 'email', message: 'x' },
          ]),
        ),
        {},
        { schema },
      ),
    )(input)

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(result.validationErrors ?? {})).toEqual(['email'])
  })

  it('throws the ActionError when a 400 has no details', async () => {
    const result = await action
      .inputSchema(schema)
      .action(() => call(failure(400, envelope('validation_failed')), {}, { schema }))(input)

    expect(result.serverError).toBe(DEFAULT_COPY.validation_failed)
  })
})
