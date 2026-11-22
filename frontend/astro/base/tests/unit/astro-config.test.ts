// astro.config.mjs read as data: the dev server's port is this package's own (a second frontend of
// a plan listens on the next free one), and the `/api` proxy of the dev server.
import { describe, expect, it } from 'vitest'

import config from '../../astro.config.mjs'

type Proxy = Record<string, { target: string; headers?: Record<string, string> }>
const proxy = (config.vite?.server?.proxy ?? {}) as Proxy

describe('astro.config.mjs', () => {
  it('listens on this package’s own port, on 127.0.0.1', () => {
    expect(config.server).toEqual({ port: __PORT__, host: '127.0.0.1' })
  })

  // @frontends-start
  it('proxies /api to the API naming this frontend’s own local host, so /api/admin reaches the gate from admin only', () => {
    expect(proxy['/api']).toEqual({
      target: 'http://127.0.0.1:__SERVER_PORT__',
      headers: { host: '__PACKAGE_DIR__.localhost:__SERVER_PORT__' },
    })
  })
  // @frontends-end
  // @nofrontends-start
  it('proxies /api as the browser sent it, beside one frontend or none', () => {
    expect(proxy['/api']?.headers).toBeUndefined()
  })
  // @nofrontends-end
})
