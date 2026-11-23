// @vitest-environment jsdom
// services/api.ts: the one wrapper over the generated client. Every case stubs the global fetch,
// the one boundary the generated client calls; nothing here touches a network.
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  errorInterceptor,
  isApiError,
  request,
  toApiError,
} from '../../src/services/api'
import { client } from '../../src/services/generated/client.gen'
import {
  deleteApiEntityById,
  getApiHealth,
  postApiEntity,
} from '../../src/services/generated/sdk.gen'

const HEALTH = { status: 'ok', uptimeSeconds: 1, version: '1' }

function stub(response: Response | Error) {
  const fetchMock = vi.fn((_request: Request) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response.clone()),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
const failure = (code: string, status: number, extra: object = {}) =>
  json({ error: { code, message: 'server text', ...extra }, requestId: 'req-1' }, status)
const health = () => request(() => getApiHealth({ throwOnError: true }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('calls a relative /api path on the page origin and returns the body', async () => {
    const fetchMock = stub(json(HEALTH))

    const body = await health()

    expect(body).toMatchObject({ status: 'ok' })
    const sent = fetchMock.mock.calls[0]?.[0] as Request
    expect(sent.method).toBe('GET')
    expect(new URL(sent.url).pathname).toBe('/api/health')
    expect(new URL(sent.url).origin).toBe(window.location.origin)
  })

  it('sends a JSON body', async () => {
    const created = { id: 'a', name: 'n' }
    const fetchMock = stub(json(created, 201))

    await request(() => postApiEntity({ body: { name: 'n' }, throwOnError: true }))

    const sent = fetchMock.mock.calls[0]?.[0] as Request
    expect(sent.method).toBe('POST')
    expect(await sent.json()).toEqual({ name: 'n' })
  })

  it('turns an envelope into an ApiError that keeps the code, status and request id', async () => {
    stub(failure('rate_limited', 429))

    await expect(health()).rejects.toEqual({
      code: 'rate_limited',
      status: 429,
      requestId: 'req-1',
    })
  })

  it('never carries the server text', async () => {
    stub(failure('internal', 500))

    const error = await health().catch((cause: unknown) => cause)

    expect(JSON.stringify(error)).not.toContain('server text')
  })

  it('treats a 401 or a 403 like any other envelope error: no refresh, one request', async () => {
    const fetchMock = stub(failure('unauthenticated', 401))
    await expect(health()).rejects.toMatchObject({ code: 'unauthenticated', status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    stub(failure('forbidden', 403))
    await expect(health()).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('lists the fields of a validation failure by path', async () => {
    stub(failure('validation_failed', 400, { details: [{ path: 'name', message: 'x' }] }))

    await expect(
      request(() => postApiEntity({ body: { name: '' }, throwOnError: true })),
    ).rejects.toMatchObject({ code: 'validation_failed', fieldPaths: ['name'] })
  })

  it('reads the request id from the header when the body has none', async () => {
    stub(json({ error: { code: 'internal', message: 'x' } }, 500, { 'x-request-id': 'from-header' }))

    await expect(health()).rejects.toMatchObject({ requestId: 'from-header' })
  })

  it('maps an unknown code and a body that is no envelope to unknown', async () => {
    stub(failure('brand_new_code', 400))
    await expect(health()).rejects.toMatchObject({ code: 'unknown', status: 400 })

    stub(new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(health()).rejects.toMatchObject({ code: 'unknown', status: 502 })
  })

  it('maps a failed fetch to network', async () => {
    stub(new TypeError('Failed to fetch'))

    await expect(health()).rejects.toEqual({ code: 'network' })
  })

  it('resolves a 204 with no body and fails on an envelope', async () => {
    stub(new Response(null, { status: 204 }))
    const body = await request(() => deleteApiEntityById({ path: { id: 'a' }, throwOnError: true }))
    expect(body ?? null).toBeNull()

    stub(failure('not_found', 404))
    await expect(
      request(() => deleteApiEntityById({ path: { id: 'a' }, throwOnError: true })),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('errorInterceptor', () => {
  it('is registered once on the generated client', () => {
    expect(client.interceptors.error.exists(errorInterceptor)).toBe(true)
  })

  it('drops a validation failure without a details list to no field paths', () => {
    const body = { error: { code: 'validation_failed', message: 'x' } }

    expect(errorInterceptor(body, new Response(null, { status: 400 }))).toEqual({
      code: 'validation_failed',
      status: 400,
    })
  })

  it('refuses the page-only codes as envelope codes', () => {
    const body = { error: { code: 'network', message: 'x' } }

    expect(errorInterceptor(body, new Response(null, { status: 500 })).code).toBe('unknown')
  })

  it('passes an ApiError through when there is no response', () => {
    const error = { code: 'validation' } as const

    expect(errorInterceptor(error, undefined)).toBe(error)
  })
})

describe('isApiError and toApiError', () => {
  it('passes an ApiError through and classifies anything else', () => {
    const error = { code: 'conflict' } as const
    expect(isApiError(error)).toBe(true)
    expect(toApiError(error)).toBe(error)
    expect(toApiError(new TypeError('x'))).toEqual({ code: 'network' })
    expect(toApiError('nope')).toEqual({ code: 'unknown' })
  })

  it.each([null, undefined, 'conflict', 42, {}, { code: 7 }, { code: 'teapot' }, new Error('x')])(
    'refuses %j',
    (value) => {
      expect(isApiError(value)).toBe(false)
    },
  )
})
