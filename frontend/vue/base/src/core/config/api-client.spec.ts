import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { setSessionHint } from '@/core/providers/session' // @server:auth
import { getApiHealth } from '@/services/generated'
import { useLoadingStore } from '@/store/loading.store'
import { stubApi } from '@/testing/stub-api'

import { createClientConfig } from './api-client'

describe('createClientConfig', () => {
  it('points at the page origin, sends same-origin credentials and throws on error', () => {
    const config = createClientConfig()

    expect(config.baseUrl).toBe(window.location.origin)
    expect(config.credentials).toBe('same-origin')
    expect(config.throwOnError).toBe(true)
  })

  it('composes the loading wrapper as the client fetch', () => {
    expect(createClientConfig().fetch).toBeTypeOf('function')
  })
})

describe('the generated client', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('calls the global fetch current at call time, so a stub installed late still answers', async () => {
    const fetchMock = stubApi({
      'GET /api/health': Response.json({ status: 'ok', uptimeSeconds: 1, version: '1' }),
    })

    const { data } = await getApiHealth()

    expect(data).toEqual({ status: 'ok', uptimeSeconds: 1, version: '1' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('counts the exchange on the loading store while it is in flight', async () => {
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

  it('throws what the API answered when the call fails (throwOnError)', async () => {
    stubApi({
      'GET /api/health': Response.json(
        { error: { code: 'internal', message: 'x' } },
        { status: 500 },
      ),
    })

    await expect(getApiHealth()).rejects.toMatchObject({ error: { code: 'internal' } })
  })
})

// @server:auth-start
describe('the generated client with the refresh wrapper', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('refreshes a 401 once, retries, and counts the whole exchange as one', async () => {
    setSessionHint()
    const loading = useLoadingStore()
    const seen: number[] = []
    let calls = 0
    const fetchMock = stubApi({
      'GET /api/health': () => {
        seen.push(loading.pending)
        calls += 1
        return calls === 1
          ? Response.json({ error: { code: 'unauthenticated', message: 'x' } }, { status: 401 })
          : Response.json({ status: 'ok', uptimeSeconds: 1, version: '1' })
      },
      'POST /api/auth/refresh': () => {
        seen.push(loading.pending)
        return Response.json({ user: {} })
      },
    })

    const { data } = await getApiHealth()

    expect(data).toEqual({ status: 'ok', uptimeSeconds: 1, version: '1' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(seen).toEqual([1, 1, 1])
    expect(loading.pending).toBe(0)
  })
})
// @server:auth-end
