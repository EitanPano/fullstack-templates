import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STORAGE_KEYS } from '@/core/config/constants'
import { hasSessionHint, onSessionLost, setSessionHint } from '@/core/providers/session'
import { storage } from '@/core/providers/storage'

import { withRefresh } from './auth.interceptor'

const ORIGIN = window.location.origin
const unauthenticated = () =>
  Response.json({ error: { code: 'unauthenticated', message: 'x' } }, { status: 401 })

// The wrapped send: answers each call from the queue of its path.
const urlOf = (input: RequestInfo | URL) => (input instanceof Request ? input.url : String(input))

function inner(answers: Record<string, Response[]>) {
  return vi.fn<typeof fetch>((input) => {
    const queue = answers[new URL(urlOf(input)).pathname]
    return Promise.resolve(queue?.shift() ?? new Response(null, { status: 404 }))
  })
}

// What the interceptor itself sends for the refresh: the global one.
function stubRefresh(handler: () => Response | Promise<Response>) {
  const refresh = vi.fn((_request: Request) => Promise.resolve(handler()))
  vi.stubGlobal('fetch', refresh)
  return refresh
}

const call = (send: typeof fetch, path: string, init?: RequestInit) =>
  send(new Request(new URL(path, ORIGIN), init))

describe('withRefresh', () => {
  const lost = vi.fn()
  let off: () => void

  beforeEach(() => {
    localStorage.clear()
    setSessionHint()
    lost.mockClear()
    off = onSessionLost(lost)
  })

  afterEach(() => {
    off()
  })

  it('passes an answer that is not a 401 through without a refresh', async () => {
    const refresh = stubRefresh(() => new Response(null, { status: 204 }))
    const send = withRefresh(inner({ '/api/user/me': [Response.json({ id: 'u1' })] }))

    const response = await call(send, '/api/user/me')

    expect(response.status).toBe(200)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('turns a 401 into one cookie refresh and one retry', async () => {
    const refresh = stubRefresh(() => Response.json({ user: {} }))
    const wrapped = inner({
      '/api/user/me': [unauthenticated(), Response.json({ id: 'u1' })],
    })

    const response = await call(withRefresh(wrapped), '/api/user/me')

    expect(response.status).toBe(200)
    expect(refresh).toHaveBeenCalledOnce()
    const sent = refresh.mock.calls[0]?.[0]
    expect(sent?.method).toBe('POST')
    expect(new URL(sent?.url ?? '').pathname).toBe('/api/auth/refresh')
    expect(sent?.credentials).toBe('same-origin')
    expect(wrapped).toHaveBeenCalledTimes(2)
    expect(lost).not.toHaveBeenCalled()
  })

  it('shares one refresh between concurrent 401s and retries each', async () => {
    let release: (response: Response) => void = () => undefined
    const refresh = stubRefresh(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    const wrapped = inner({
      '/api/user/me': [unauthenticated(), Response.json({ id: 'u1' })],
      '/api/module': [unauthenticated(), Response.json({ items: [] })],
    })
    const send = withRefresh(wrapped)

    const first = call(send, '/api/user/me')
    const second = call(send, '/api/module')
    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalledOnce()
    })
    release(Response.json({ user: {} }))
    const [one, two] = await Promise.all([first, second])

    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    expect(refresh).toHaveBeenCalledOnce()
    expect(wrapped).toHaveBeenCalledTimes(4)
  })

  it('starts a new refresh for a 401 after the last one settled', async () => {
    const refresh = stubRefresh(() => Response.json({ user: {} }))
    const send = withRefresh(
      inner({
        '/api/user/me': [
          unauthenticated(),
          Response.json({}),
          unauthenticated(),
          Response.json({}),
        ],
      }),
    )

    await call(send, '/api/user/me')
    await call(send, '/api/user/me')

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('retries with a clone, so a request body is sent again', async () => {
    stubRefresh(() => Response.json({ user: {} }))
    const bodies: string[] = []
    const send = withRefresh(
      vi.fn<typeof fetch>(async (input) => {
        bodies.push(input instanceof Request ? await input.text() : '')
        return bodies.length === 1 ? unauthenticated() : Response.json({})
      }),
    )

    await call(send, '/api/user/me', { method: 'PATCH', body: '{"phone":null}' })

    expect(bodies).toEqual(['{"phone":null}', '{"phone":null}'])
  })

  it('hands back the retry when it is a 401 again, without a second refresh', async () => {
    const refresh = stubRefresh(() => Response.json({ user: {} }))
    const send = withRefresh(inner({ '/api/user/me': [unauthenticated(), unauthenticated()] }))

    const response = await call(send, '/api/user/me')

    expect(response.status).toBe(401)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not refresh without the session hint', async () => {
    localStorage.clear()
    const refresh = stubRefresh(() => Response.json({}))
    const send = withRefresh(inner({ '/api/user/me': [unauthenticated()] }))

    const response = await call(send, '/api/user/me')

    expect(response.status).toBe(401)
    expect(refresh).not.toHaveBeenCalled()
  })

  it.each([
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/refresh',
    '/api/auth/otp',
    '/api/auth/otp/verification',
  ])('exempts %s: its 401 is not an expired session', async (path) => {
    const refresh = stubRefresh(() => Response.json({}))
    const send = withRefresh(inner({ [path]: [unauthenticated()] }))

    const response = await call(send, path, { method: 'POST', body: '{}' })

    expect(response.status).toBe(401)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does not exempt sign-out: with only the refresh cookie left it needs one refresh', async () => {
    const refresh = stubRefresh(() => Response.json({ user: {} }))
    const send = withRefresh(
      inner({ '/api/auth/logout': [unauthenticated(), new Response(null, { status: 204 })] }),
    )

    const response = await call(send, '/api/auth/logout', { method: 'POST', body: '{}' })

    expect(response.status).toBe(204)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('leaves another origin and a path outside /api alone', async () => {
    const refresh = stubRefresh(() => Response.json({}))
    const other = new Request('https://elsewhere.example/api/user/me')
    const outside = new Request(new URL('/assets/app.js', ORIGIN))
    const wrapped = vi.fn(() => Promise.resolve(unauthenticated()))
    const send = withRefresh(wrapped)

    expect((await send(other)).status).toBe(401)
    expect((await send(outside)).status).toBe(401)

    expect(refresh).not.toHaveBeenCalled()
    expect(wrapped).toHaveBeenCalledTimes(2)
  })

  it.each([400, 401, 403])(
    'clears the hint and emits sessionLost once when the refresh answers %i',
    async (status) => {
      stubRefresh(() => Response.json({ error: { code: 'x', message: 'x' } }, { status }))
      const send = withRefresh(
        inner({ '/api/user/me': [unauthenticated()], '/api/module': [unauthenticated()] }),
      )

      const [one, two] = await Promise.all([call(send, '/api/user/me'), call(send, '/api/module')])

      expect(one.status).toBe(401)
      expect(two.status).toBe(401)
      expect(hasSessionHint()).toBe(false)
      expect(lost).toHaveBeenCalledOnce()
    },
  )

  it('returns false, not a swallowed error, when a sessionLost listener throws', async () => {
    const queued: (() => void)[] = []
    vi.stubGlobal('queueMicrotask', (task: () => void) => queued.push(task))
    const boom = new Error('listener bug')
    const offBad = onSessionLost(() => {
      throw boom
    })
    const refresh = vi.fn((_request: Request) =>
      Promise.resolve(new Response(null, { status: 401 })),
    )
    vi.stubGlobal('fetch', refresh)
    const send = withRefresh(inner({ '/api/user/me': [unauthenticated()] }))

    const response = await call(send, '/api/user/me')

    expect(response.status).toBe(401)
    expect(hasSessionHint()).toBe(false)
    expect(lost).toHaveBeenCalledOnce()
    const thrown = queued.flatMap((task) => {
      try {
        task()
        return []
      } catch (cause) {
        return [cause]
      }
    })
    expect(thrown).toEqual([boom])
    offBad()
  })

  it.each([429, 500, 503])('keeps the hint when the refresh answers %i', async (status) => {
    stubRefresh(() => new Response(null, { status }))
    const send = withRefresh(inner({ '/api/user/me': [unauthenticated()] }))

    const response = await call(send, '/api/user/me')

    expect(response.status).toBe(401)
    expect(storage.get(STORAGE_KEYS.sessionHint)).toBe('1')
    expect(lost).not.toHaveBeenCalled()
  })

  it('keeps the hint when the refresh is lost to the network', async () => {
    stubRefresh(() => {
      throw new TypeError('Failed to fetch')
    })
    const send = withRefresh(inner({ '/api/user/me': [unauthenticated()] }))

    const response = await call(send, '/api/user/me')

    expect(response.status).toBe(401)
    expect(hasSessionHint()).toBe(true)
    expect(lost).not.toHaveBeenCalled()
  })

  it('wraps the global fetch, read at call time, when given no inner', async () => {
    const stub = stubRefresh(() => Response.json({ ok: true }))

    const response = await withRefresh()(new Request(new URL('/api/health', ORIGIN)))

    expect(response.status).toBe(200)
    expect(stub).toHaveBeenCalledOnce()
  })
})
