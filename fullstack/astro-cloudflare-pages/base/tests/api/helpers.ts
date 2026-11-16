// helpers.ts belongs: the two ways a test reaches the server. `send` posts a request to the built
// worker, through the platform's real routing and the root middleware. `through` runs one handler
// built in the test under the same root middleware with a synthetic event, for what no route
// exercises (a probe route that throws, a production environment). It does not belong: assertions
// about one endpoint.
import { env, exports } from 'cloudflare:workers'

import { rootMiddleware } from '../../server/middleware/handler'
import type { PlatformEvent } from '../../server/middleware/handler'

const ORIGIN = 'http://example.com'

export type Sent = { method?: string; body?: unknown; headers?: Record<string, string> }

function toRequest(path: string, { method = 'GET', body, headers = {} }: Sent): Request {
  const init: RequestInit = { method, headers: { ...headers } }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    const sent = init.headers as Record<string, string>
    if (sent['content-type'] === undefined) sent['content-type'] = 'application/json'
  }
  return new Request(`${ORIGIN}${path}`, init)
}

export function send(path: string, sent: Sent = {}): Promise<Response> {
  return exports.default.fetch(toRequest(path, sent))
}

export async function json<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export async function createModule(name: string): Promise<{ id: string; name: string }> {
  return json(await send('/api/module', { method: 'POST', body: { name } }))
}

type Handler = (event: PlatformEvent) => Promise<Response>

// The promises a handler gave to waitUntil in this call; await them to see their effects.
export function through(
  handler: Handler,
  path: string,
  sent: Sent & { bindings?: object; params?: Record<string, string> } = {},
): Promise<Response> & { waited: Promise<unknown>[] } {
  const waited: Promise<unknown>[] = []
  const event: PlatformEvent = {
    request: toRequest(path, sent),
    env: (sent.bindings ?? env) as Env,
    waitUntil: (promise) => void waited.push(promise),
    data: {},
    params: sent.params ?? {},
    next: () => handler(event),
  }
  return Object.assign(rootMiddleware(event), { waited })
}

export async function settle(response: { waited: Promise<unknown>[] }): Promise<void> {
  await Promise.all(response.waited)
}
