// Each entity's router answers its endpoints when mounted ALONE in a fresh app with the root
// middleware: nothing of the entry (server.ts) or of another entity is needed, so an entity can be
// served by a Worker of its own. One test per shipped entity.
import { describe, expect, it } from 'vitest'

import healthRoutes from '../../server/api/health/routes'
import entityRoutes from '../../server/api/entity/routes'
import { json, mounted } from './helpers'

type PublicEntity = { id: string; name: string; status: string }

describe('the health router mounted alone', () => {
  const health = mounted(healthRoutes, '/api/health')

  it('answers liveness and readiness, and 405 with Allow for another method', async () => {
    const live = await health('/api/health')
    expect(live.status).toBe(200)
    expect(await json(live)).toMatchObject({ status: 'ok' })
    expect(live.headers.get('x-request-id')).toBeTruthy()

    expect((await health('/api/health/ready')).status).toBe(200)

    const wrong = await health('/api/health/ready', { method: 'POST' })
    expect(wrong.status).toBe(405)
    expect(wrong.headers.get('allow')).toBe('GET')
  })
})

describe('the entity router mounted alone', () => {
  const entity = mounted(entityRoutes, '/api/entity')

  it('serves create, list, read, update and delete under the root middleware', async () => {
    const created = await entity('/api/entity', { method: 'POST', body: { name: 'Alone' } })
    expect(created.status).toBe(201)
    const { id } = await json<PublicEntity>(created)

    const listed = await json<{ items: PublicEntity[] }>(await entity('/api/entity'))
    expect(listed.items.map((item) => item.id)).toEqual([id])

    expect(await json<PublicEntity>(await entity(`/api/entity/${id}`))).toMatchObject({ name: 'Alone' })
    const renamed = await entity(`/api/entity/${id}`, { method: 'PATCH', body: { name: 'Renamed' } })
    expect(await json<PublicEntity>(renamed)).toMatchObject({ name: 'Renamed' })
    expect((await entity(`/api/entity/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await entity(`/api/entity/${id}`)).status).toBe(404)
  })

  it('answers a failure with the envelope and a method it lacks with 405 and Allow', async () => {
    const invalid = await entity('/api/entity', { method: 'POST', body: { name: '' } })
    expect(invalid.status).toBe(400)
    expect(await json(invalid)).toMatchObject({
      error: { code: 'validation_failed' },
      requestId: invalid.headers.get('x-request-id'),
    })

    const put = await entity('/api/entity', { method: 'PUT', body: {} })
    expect(put.status).toBe(405)
    expect(put.headers.get('allow')).toBe('GET, POST')
    expect((await entity('/api/entity/x', { method: 'POST', body: {} })).headers.get('allow')).toBe(
      'GET, PATCH, DELETE',
    )
  })
})
