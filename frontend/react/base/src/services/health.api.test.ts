import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isApiError } from '@/models/api-error'
import { healthApi } from '@/services/health.api'
import { createStore } from '@/store'
import { stubApi } from '@/testing/stub-api'

const HEALTH = { status: 'ok', uptimeSeconds: 12, version: '1.2.3' }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('health.api', () => {
  it('resolves getHealth to the data and provides the Health tag', async () => {
    stubApi({ 'GET /api/health': Response.json(HEALTH) })
    const store = createStore()

    const result = await store.dispatch(healthApi.endpoints.getHealth.initiate())

    expect(result.data).toMatchObject({ version: '1.2.3', uptimeSeconds: 12 })
    expect(healthApi.util.selectInvalidatedBy(store.getState(), ['Health'])).toHaveLength(1)
  })

  it('turns a 503 into an ApiError with the default copy', async () => {
    stubApi({
      'GET /api/health': () =>
        Response.json(
          { error: { code: 'upstream_unavailable', message: 'db down' }, requestId: 'r1' },
          { status: 503 },
        ),
    })
    const store = createStore()

    const result = await store.dispatch(healthApi.endpoints.getHealth.initiate())

    expect(result.isError).toBe(true)
    expect(isApiError(result.error)).toBe(true)
    expect(result.error).toMatchObject({
      code: 'upstream_unavailable',
      message: 'The service is unavailable right now. Try again in a moment.',
    })
  })

  it('refetches the query after refreshHealth invalidates the tag', async () => {
    const fetchMock = stubApi({ 'GET /api/health': Response.json(HEALTH) })
    const store = createStore()
    const subscription = store.dispatch(healthApi.endpoints.getHealth.initiate())
    await subscription
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await store.dispatch(healthApi.endpoints.refreshHealth.initiate())

    // One call for the mutation itself, one for the refetch it triggers.
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
    subscription.unsubscribe()
  })
})
