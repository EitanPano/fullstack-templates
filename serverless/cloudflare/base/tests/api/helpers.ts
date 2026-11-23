// helpers.ts belongs: the three ways a test reaches the server. `send` posts a request to the
// Worker's own entry (server/index.ts), through the real routing and the root middleware.
// `through` runs one handler built in the test in a fresh root app, for what no route exercises (a
// probe route that throws, a production environment). `mounted` mounts one entity's router alone
// in a fresh root app. Both take the bindings to run with and collect what the code gave to
// waitUntil. It does not belong: assertions about one endpoint.
import { env, exports } from 'cloudflare:workers'
import type { Hono } from 'hono'

import { rootApp, type AppEnv, type Handler } from '../../server/middleware/handler'
import { app as workerApp } from '../../server/server'

// `host` is the host the request names (`site.localhost`): the Worker maps it to a frontend.
export type Sent = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  host?: string
}
type Reach = Sent & { bindings?: object }

function toRequest(path: string, { method = 'GET', body, headers = {}, host }: Sent): Request {
  const init: RequestInit = { method, headers: { ...headers } }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    const sent = init.headers as Record<string, string>
    if (sent['content-type'] === undefined) sent['content-type'] = 'application/json'
  }
  return new Request(`http://${host ?? 'example.com'}${path}`, init)
}

export function send(path: string, sent: Sent = {}): Promise<Response> {
  return exports.default.fetch(toRequest(path, sent))
}

export async function json<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export async function createEntity(name: string): Promise<{ id: string; name: string }> {
  return json(await send('/api/entity', { method: 'POST', body: { name } }))
}

// The promises the code gave to waitUntil in this call; await them to see their effects.
type Reached = Promise<Response> & { waited: Promise<unknown>[] }

function run(app: Hono<AppEnv>, path: string, sent: Reach): Reached {
  const waited: Promise<unknown>[] = []
  const context = {
    waitUntil: (promise: Promise<unknown>) => void waited.push(promise),
    passThroughOnException: () => undefined,
  } as unknown as ExecutionContext
  const response = Promise.resolve(
    app.fetch(toRequest(path, sent), (sent.bindings ?? env) as Env, context),
  )
  return Object.assign(response, { waited })
}

// `route` is the Hono path the handler answers, for a test that reads route parameters.
export function through(
  handler: Handler,
  path: string,
  sent: Reach & { route?: string } = {},
): Reached {
  const app = rootApp('*')
  app.all(sent.route ?? '*', handler)
  return run(app, path, sent)
}

// The Worker's own app (server/server.ts) with the bindings a test chooses: a fake `ASSETS` serves
// pages from folders the test names, a changed `FRONTEND_HOSTS` is another deployment.
export function served(path: string, sent: Reach = {}): Reached {
  return run(workerApp, path, sent)
}

// One entity's router, mounted alone at `base` under the root middleware.
export function mounted(routes: Hono<AppEnv>, base: string) {
  return (path: string, sent: Reach = {}): Reached => {
    const app = rootApp()
    app.route(base, routes)
    return run(app, path, sent)
  }
}

export async function settle(response: { waited: Promise<unknown>[] }): Promise<void> {
  await Promise.all(response.waited)
}
