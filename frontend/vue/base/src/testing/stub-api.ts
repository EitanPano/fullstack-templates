import { vi } from 'vitest'

type Handler = Response | (() => Response | Promise<Response>)

// A fake API on the global fetch, keyed `METHOD /path`. The generated client builds a Request and
// calls the global fetch, so this is the one boundary tests fake. Unlisted calls answer 404.
export function stubApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn((input: Request) => {
    const key = `${input.method} ${new URL(input.url).pathname}`
    const handler = routes[key]
    if (handler === undefined) {
      return Promise.resolve(
        Response.json({ error: { code: 'not_found', message: 'x' } }, { status: 404 }),
      )
    }
    return Promise.resolve(typeof handler === 'function' ? handler() : handler.clone())
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
