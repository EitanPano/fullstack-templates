// handler.ts belongs: the request flow the route files share. `handle(...gates, controller)` turns
// a gate chain and a controller into the function a route file exports; `rootMiddleware` is what
// functions/_middleware.ts runs around every function: request id, error envelope, response
// headers, the one log line. It uses only web-standard Request and Response, so a move off Pages
// replaces functions/ and nothing here.
// It does not belong: a gate's own logic (validate.ts, rate-limit.ts) or a controller's rules.
import { getConfig, type Config } from '../config/env'
import type { Bindings } from '../infra/bindings'
import { createDb, type Db } from '../infra/db'
import { createLogger, type Logger } from '../services/logger'
import { AppError } from '../services/utils/error'
import { errorResponse } from './error-handler'
import { resolveRequestId } from './request-id'
import { logRequest } from './request-log'

// The part of the platform's event the server reads. Pages' EventContext is assignable to it, so
// functions/ passes the event through without importing a Pages type here.
export type PlatformEvent = {
  request: Request
  env: Bindings
  waitUntil(promise: Promise<unknown>): void
  data: Record<string, unknown>
  params: Record<string, string | string[] | undefined>
  next(): Promise<Response>
}

// What every gate and controller receives, one object per request. A gate fills a slot it owns
// (validate sets `input`; the auth gates of the `auth` flag add `caller`); nothing else is mutable.
export type Context = {
  request: Request
  url: URL
  // The validated configuration (config/env.ts); the raw bindings are `bindings`.
  env: Config
  bindings: Bindings
  db: Db
  params: Record<string, string | string[] | undefined>
  // Set by validate(): the parsed body, query and params. Read it with readInput().
  input: Partial<Record<'body' | 'query' | 'params', unknown>>
  requestId: string
  log: Logger
  waitUntil(promise: Promise<unknown>): void
}

// A gate runs before the controller. Throw an AppError to refuse; return a Response to answer in
// place of the controller (the rest of the chain is skipped); return nothing to continue.
export type Gate = (ctx: Context) => void | Response | Promise<void | Response>

export type Controller = (ctx: Context) => Response | Promise<Response>

export type Handler = (event: PlatformEvent) => Promise<Response>

function warnOnce(message: string): void {
  createLogger({ level: 'warn' }).warn(message)
}

// `export const onRequestGet = handle(rateLimit(...), validate(request), controller)`
export function handle(...steps: [...gates: Gate[], controller: Controller]): Handler {
  const controller = steps.at(-1) as Controller
  const gates = steps.slice(0, -1) as Gate[]
  return async (event) => {
    const config = getConfig(event.env, warnOnce)
    const requestId =
      typeof event.data.requestId === 'string'
        ? event.data.requestId
        : resolveRequestId(event.request.headers)
    const ctx: Context = {
      request: event.request,
      url: new URL(event.request.url),
      env: config,
      bindings: event.env,
      db: createDb(event.env),
      params: event.params,
      input: {},
      requestId,
      log: createLogger({ level: config.LOG_LEVEL, bindings: { requestId } }),
      waitUntil: (promise) => event.waitUntil(promise),
    }
    for (const gate of gates) {
      const answer = await gate(ctx)
      if (answer instanceof Response) return answer
    }
    return controller(ctx)
  }
}

// A route file's `onRequest`: every method it does not export answers 405 with an Allow header.
export function methodNotAllowed(...allowed: string[]): Handler {
  return handle(() => {
    throw new AppError('method_not_allowed', 'method not allowed', undefined, {
      headers: { Allow: allowed.join(', ') },
    })
  })
}

export const notFound: Handler = handle(() => {
  throw new AppError('not_found', 'route not found')
})

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

function logLevel(bindings: Bindings): Config['LOG_LEVEL'] {
  try {
    return getConfig(bindings, warnOnce).LOG_LEVEL
  } catch {
    // An invalid configuration still gets its error logged.
    return 'info'
  }
}

// functions/_middleware.ts calls this with the event Pages gives it. Everything under it may
// throw: an error becomes the envelope here, and every response leaves with the same headers.
export async function rootMiddleware(event: PlatformEvent): Promise<Response> {
  const started = performance.now()
  const requestId = resolveRequestId(event.request.headers)
  event.data.requestId = requestId
  const log = createLogger({ level: logLevel(event.env), bindings: { requestId } })

  let response: Response
  try {
    response = await event.next()
  } catch (error) {
    response = errorResponse(error, requestId, log)
  }

  // A response from the static asset fallback or a fetch can have immutable headers: copy it.
  const finished = new Response(response.body, response)
  finished.headers.set('x-request-id', requestId)
  finished.headers.set('x-content-type-options', 'nosniff')
  finished.headers.set('referrer-policy', 'no-referrer')
  if (!finished.headers.has('cache-control')) finished.headers.set('cache-control', 'no-store')

  logRequest(log, event.request, finished, started)
  return finished
}
