// `frameOnly`: a guard for an entity only the frame calls (issuing a token, accepting a view or a
// click). The template ships no such entity, so a throwaway one is mounted on a test app as
// api/sdk/routes.ts mounts a real one: behind the namespace gate, the guard on the entity's
// whole path, its own router under it.
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import {
  handle,
  json as jsonResponse,
  namespaceGuard,
  type AppEnv,
} from '../../server/middleware/handler'
import { frameOnly, sdkGate, sdkHeaders } from '../../server/middleware/sdk-gate'
import { json, mounted } from './helpers'
import { A, KEY_A, sdkBindings } from './sdk-assets'

const token = new Hono<AppEnv>()
token.get(
  '/',
  handle(() => jsonResponse({ token: 'x' })),
)
token.post(
  '/view',
  handle(() => jsonResponse({ counted: true })),
)

const routes = new Hono<AppEnv>()
routes.use('*', namespaceGuard(sdkHeaders, ...sdkGate))
routes.use('/token/*', frameOnly)
routes.route('/token', token)
const reach = mounted(routes, '/api/sdk/v1')
const PATH = '/api/sdk/v1/token'
const SUB_PATH = '/api/sdk/v1/token/view'

describe('a frame-only route', () => {
  it('refuses a listed origin with its key on a frame-only route', async () => {
    const res = await reach(PATH, {
      headers: { Origin: A, 'X-Sdk-Key': KEY_A },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(403)
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('forbidden')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('refuses a listed origin with its key on a path under a frame-only route', async () => {
    const res = await reach(SUB_PATH, {
      method: 'POST',
      headers: { Origin: A, 'X-Sdk-Key': KEY_A },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a frame-only preflight with no allow header', async () => {
    const res = await reach(PATH, {
      method: 'OPTIONS',
      headers: { Origin: A, 'Access-Control-Request-Method': 'GET' },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('access-control-allow-methods')).toBeNull()
    expect(res.headers.get('access-control-max-age')).toBeNull()
  })

  it('answers a preflight for a path under a frame-only route with no allow header', async () => {
    const res = await reach(SUB_PATH, {
      method: 'OPTIONS',
      headers: { Origin: A, 'Access-Control-Request-Method': 'POST' },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a same-origin request with the key on a frame-only route', async () => {
    const res = await reach(PATH, {
      headers: { 'Sec-Fetch-Site': 'same-origin', 'X-Sdk-Key': KEY_A },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ token: 'x' })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a same-origin request with the key on a path under a frame-only route', async () => {
    const res = await reach(SUB_PATH, {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin', 'X-Sdk-Key': KEY_A },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ counted: true })
  })

  it('refuses a same-origin request without a key on a frame-only route', async () => {
    const res = await reach(PATH, {
      headers: { 'Sec-Fetch-Site': 'same-origin' },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(403)
  })
})
