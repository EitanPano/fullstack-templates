// services/api.ts: the one fetch wrapper. Every case stubs fetch; nothing here touches a network.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HealthResponse } from '@shared/schemas/health'
import { ModulePage, PublicModule } from '@shared/schemas/module'

import { ApiError, isApiError, request, send, toApiError } from '../../../src/services/api'

const HEALTH = { status: 'ok', uptimeSeconds: 1, version: '1' }

function stub(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('calls a relative /api path with JSON headers and returns the parsed body', async () => {
    const fetchMock = stub(json(HEALTH))

    const body = await request('/api/health', { response: HealthResponse })

    expect(body).toEqual(HEALTH)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/health')
    expect(init.method).toBe('GET')
    expect(new Headers(init.headers).get('accept')).toBe('application/json')
    expect(init.body).toBeUndefined()
  })

  it('sends a JSON body and a query string', async () => {
    const created = {
      id: 'a',
      name: 'n',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const fetchMock = stub(json(created, 201))

    await request('/api/module', {
      method: 'POST',
      query: { limit: 5, cursor: undefined },
      body: { name: 'n' },
      response: PublicModule,
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/module?limit=5')
    expect(init.body).toBe('{"name":"n"}')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
  })

  it('turns an envelope into a typed error that keeps the code, status and request id', async () => {
    stub(failure('rate_limited', 429))

    const error = await request('/api/module', { response: ModulePage }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'rate_limited', status: 429, requestId: 'req-1' })
  })

  it('never carries the server text', async () => {
    stub(failure('internal', 500))

    const error = (await request('/api/x', { response: ModulePage }).catch(
      (e: unknown) => e,
    )) as Error

    expect(error.message).not.toContain('server text')
  })

  it('treats a 401 or a 403 like any other envelope error', async () => {
    stub(failure('unauthenticated', 401))
    await expect(request('/api/x', { response: ModulePage })).rejects.toMatchObject({
      code: 'unauthenticated',
    })
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)

    stub(failure('forbidden', 403))
    await expect(request('/api/x', { response: ModulePage })).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('lists the fields of a validation failure by path', async () => {
    stub(failure('validation_failed', 400, { details: [{ path: 'name', message: 'x' }] }))

    await expect(
      request('/api/module', { method: 'POST', body: {}, response: PublicModule }),
    ).rejects.toMatchObject({ code: 'validation_failed', fieldPaths: ['name'] })
  })

  it('reads the request id from the header when the body has none', async () => {
    stub(
      json({ error: { code: 'internal', message: 'x' } }, 500, { 'x-request-id': 'from-header' }),
    )

    await expect(request('/api/x', { response: ModulePage })).rejects.toMatchObject({
      requestId: 'from-header',
    })
  })

  it('maps an unknown code and a non-envelope body to unknown', async () => {
    stub(failure('brand_new_code', 400))
    await expect(request('/api/x', { response: ModulePage })).rejects.toMatchObject({
      code: 'unknown',
    })

    stub(new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(request('/api/x', { response: ModulePage })).rejects.toMatchObject({
      code: 'unknown',
      status: 502,
    })
  })

  it('maps a failed fetch to network', async () => {
    stub(new TypeError('Failed to fetch'))

    await expect(request('/api/x', { response: ModulePage })).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('refuses a success body that does not match the shared schema', async () => {
    stub(json({ status: 'wrong' }))

    await expect(request('/api/health', { response: HealthResponse })).rejects.toMatchObject({
      code: 'unknown',
      status: 200,
    })
  })

  it('refuses a path outside /api before any request is made', async () => {
    const fetchMock = stub(json(HEALTH))

    await expect(
      request('https://elsewhere.example/api/health', { response: HealthResponse }),
    ).rejects.toThrow(/relative \/api/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('send', () => {
  it('resolves on a 204 and fails on an envelope', async () => {
    stub(new Response(null, { status: 204 }))
    await expect(send('/api/module/a', { method: 'DELETE' })).resolves.toBeUndefined()

    stub(failure('not_found', 404))
    await expect(send('/api/module/a', { method: 'DELETE' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('isApiError and toApiError', () => {
  it('passes an ApiError through and classifies anything else', () => {
    const error = new ApiError('conflict')
    expect(isApiError(error)).toBe(true)
    expect(toApiError(error)).toBe(error)
    expect(toApiError(new TypeError('x')).code).toBe('network')
    expect(toApiError('nope').code).toBe('unknown')
    expect(isApiError({ code: 'conflict' })).toBe(false)
  })
})
