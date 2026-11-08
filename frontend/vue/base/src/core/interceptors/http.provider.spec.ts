import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { client } from '@/services/generated/client.gen'
import { getApiHealth } from '@/services/generated/sdk.gen'
import { useLoadingStore } from '@/store/loading.store'
import { stubApi } from '@/testing/stub-api'

import { installInterceptors } from './http.provider'

const thrownFetch = () => {
  throw new TypeError('Failed to fetch')
}

describe('installInterceptors', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installInterceptors()
  })

  it('makes a facade call reject with the ApiError of an envelope', async () => {
    stubApi({
      'GET /api/health': Response.json(
        { error: { code: 'not_found', message: 'x' }, requestId: 'r-7' },
        { status: 404 },
      ),
    })

    await expect(getApiHealth()).rejects.toEqual({
      code: 'not_found',
      status: 404,
      requestId: 'r-7',
    })
  })

  it('makes a thrown fetch reject with a network ApiError', async () => {
    stubApi({ 'GET /api/health': thrownFetch })

    await expect(getApiHealth()).rejects.toEqual({ code: 'network' })
  })

  it('counts one exchange once on the loading store, up and down', async () => {
    const loading = useLoadingStore()
    let seen = -1
    stubApi({
      'GET /api/health': () => {
        seen = loading.pending
        return Response.json({ status: 'ok', uptimeSeconds: 1, version: '1' })
      },
    })

    await getApiHealth()

    expect(seen).toBe(1)
    expect(loading.pending).toBe(0)
  })

  it('counts down after a failed exchange and after a thrown fetch', async () => {
    const loading = useLoadingStore()
    stubApi({
      'GET /api/health': Response.json(
        { error: { code: 'internal', message: 'x' } },
        { status: 500 },
      ),
    })
    await expect(getApiHealth()).rejects.toMatchObject({ code: 'internal' })
    expect(loading.pending).toBe(0)

    stubApi({ 'GET /api/health': thrownFetch })
    await expect(getApiHealth()).rejects.toMatchObject({ code: 'network' })
    expect(loading.pending).toBe(0)
  })

  it('registers the error interceptor once however often it is installed', () => {
    const before = client.interceptors.error.fns.length

    installInterceptors()
    installInterceptors()

    expect(client.interceptors.error.fns.length).toBe(before)
  })
})
