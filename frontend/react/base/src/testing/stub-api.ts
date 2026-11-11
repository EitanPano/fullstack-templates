import { vi } from 'vitest'

type Handler = Response | (() => Response | Promise<Response>)

// A fake API on the global fetch, keyed `METHOD /path`. The generated client builds a Request and // @server
// calls the global fetch, so this is the one boundary tests fake. Unlisted calls answer 404. // @server
// A fake API on the global fetch, keyed `METHOD /path`. A request is a Request on the // @noserver
// global fetch, so this is the one boundary tests fake. Unlisted calls answer 404. // @noserver
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
