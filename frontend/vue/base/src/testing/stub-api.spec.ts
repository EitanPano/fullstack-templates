import { describe, expect, it } from 'vitest'

import { stubApi } from './stub-api'

describe('stubApi', () => {
  it('answers a listed METHOD /path and 404s the rest', async () => {
    const fetchMock = stubApi({ 'GET /api/health': Response.json({ status: 'ok' }) })

    const ok = await fetch(new Request('http://localhost/api/health'))
    const missing = await fetch(new Request('http://localhost/api/other'))

    expect(await ok.json()).toEqual({ status: 'ok' })
    expect(missing.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('serves a function handler fresh on every call', async () => {
    let calls = 0
    stubApi({ 'POST /api/x': () => Response.json({ n: ++calls }) })

    const first = await fetch(new Request('http://localhost/api/x', { method: 'POST' }))
    const second = await fetch(new Request('http://localhost/api/x', { method: 'POST' }))

    expect(await first.json()).toEqual({ n: 1 })
    expect(await second.json()).toEqual({ n: 2 })
  })
})
