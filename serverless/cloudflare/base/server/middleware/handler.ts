// handler.ts belongs: the request flow every route shares, and the one place besides the entries
// and the routes.ts files that imports Hono. `handle(...gates, controller)` turns a gate chain and
// a controller into the Hono handler a routes.ts registers; `rootApp` builds the app that runs
// `rootMiddleware` (request id, the one log line, response headers) and the error handler around
// every /api response. A controller, a service and a gate see `Context`, never Hono.
// It does not belong: a gate's own logic (validate.ts, rate-limit.ts) or a controller's rules.
import { Hono, type Context as HonoContext, type ErrorHandler, type MiddlewareHandler } from 'hono'
import { matchedRoutes } from 'hono/route' // @sdk

import { MAX_BODY_BYTES, SDK_MAX_BODY_BYTES } from '../config/constants' // @sdk
import { getConfig, type Config } from '../config/env'
import type { Bindings } from '../infra/bindings'
import { createDb, type Db } from '../infra/db'
import { createLogger, type Logger } from '../services/logger'
import type { SdkKey } from '../services/security/sdk-keys' // @sdk
import { AppError } from '../services/utils/error'
import { errorResponse } from './error-handler'
import { resolveRequestId } from './request-id'
import { logRequest } from './request-log'

// The app's Hono types: the platform's bindings and the one value the root middleware sets.
// @nosdk-start
export type AppEnv = { Bindings: Bindings; Variables: { requestId?: string } }
// @nosdk-end
// @sdk-start
export type AppEnv = {
  Bindings: Bindings
  Variables: { requestId?: string; sdkKey?: SdkKey }
}
// @sdk-end

// What every gate and controller receives, one object per request. A gate fills a slot it owns
// (validate sets `input`); nothing else is mutable.
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
  // @sdk-start
  // The handlers Hono matched for this request: the namespace gate looks for `frameOnly` among them.
  handlers: readonly unknown[]
  // The record of the request's key, set once by the namespace's key gate and shared by every
  // context of the request; undefined until the key has been admitted.
  sdkKey: SdkKey | undefined
  // What a JSON body may weigh: the namespace's cap under /api/sdk/, else MAX_BODY_BYTES.
  maxBodyBytes: number
  // @sdk-end
}

// A gate runs before the controller. Throw an AppError to refuse; return a Response to answer in
// place of the controller (the rest of the chain is skipped); return nothing to continue.
export type Gate = (ctx: Context) => void | Response | Promise<void | Response>

export type Controller = (ctx: Context) => Response | Promise<Response>

export type Handler = (c: HonoContext<AppEnv>) => Promise<Response>

const API_POLICY = "default-src 'none'; frame-ancestors 'none'"

function contextOf(c: HonoContext<AppEnv>): Context {
  const config = getConfig(c.env)
  const requestId = c.get('requestId') ?? resolveRequestId(c.req.raw.headers)
  return {
    request: c.req.raw,
    url: new URL(c.req.url),
    env: config,
    bindings: c.env,
    db: createDb(c.env),
    params: c.req.param(),
    input: {},
    requestId,
    log: createLogger({ level: config.LOG_LEVEL, bindings: { requestId } }),
    waitUntil: (promise) => {
      c.executionCtx.waitUntil(promise)
    },
    // @sdk-start
    handlers: matchedRoutes(c).map((route) => route.handler),
    get sdkKey() {
      return c.get('sdkKey')
    },
    set sdkKey(record) {
      c.set('sdkKey', record)
    },
    maxBodyBytes: new URL(c.req.url).pathname.startsWith('/api/sdk/')
      ? SDK_MAX_BODY_BYTES
      : MAX_BODY_BYTES,
    // @sdk-end
  }
}

// `router.post('/', handle(rateLimit(...), validate(request), controller))` in a routes.ts.
export function handle(...steps: [...gates: Gate[], controller: Controller]): Handler {
  const controller = steps.at(-1) as Controller
  const gates = steps.slice(0, -1) as Gate[]
  return async (c) => {
    const ctx = contextOf(c)
    for (const gate of gates) {
      const answer = await gate(ctx)
      if (answer instanceof Response) return answer
    }
    return controller(ctx)
  }
}

// The same gate chain in front of a whole router: `routes.use('*', guard(gate))`. A gate that
// throws or answers ends the request; otherwise the router's own routes run.
export function guard(...gates: Gate[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ctx = contextOf(c)
    for (const gate of gates) {
      const answer = await gate(ctx)
      if (answer instanceof Response) return answer
    }
    await next()
  }
}

// @sdk-start
// `guard` for a namespace that also writes headers on every answer (the SDK's CORS): `decorate`
// returns them once the gates have run, so it sees what a gate stored on the context (the key's
// record); they are set on the gates' answer, a refusal or the router's, so a 403 and a 429 carry
// them like a 200. A gate that throws before it stored anything leaves the fixed headers alone.
export function namespaceGuard(
  decorate: (ctx: Context) => Record<string, string>,
  ...gates: Gate[]
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ctx = contextOf(c)
    let answer: Response | undefined
    try {
      for (const gate of gates) {
        const result = await gate(ctx)
        if (result instanceof Response) {
          answer = result
          break
        }
      }
    } catch (error) {
      answer = errorResponse(error, ctx.requestId, ctx.log)
    }
    if (answer === undefined) {
      await next()
      answer = c.res
    }
    c.res = withHeaders(answer, decorate(ctx))
  }
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  const target = new Response(response.body, response)
  for (const [name, value] of Object.entries(headers)) target.headers.set(name, value)
  return target
}

// @sdk-end
// A path's fallback after its endpoints: a method it does not register answers 405 with Allow.
export function methodNotAllowed(...allowed: string[]): Handler {
  return handle(() => {
    throw new AppError('method_not_allowed', 'method not allowed', undefined, {
      headers: { Allow: allowed.join(', ') },
    })
  })
}

// An /api path no router claims: the not_found envelope.
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
    return getConfig(bindings).LOG_LEVEL
  } catch {
    // An invalid configuration still gets its error logged.
    return 'info'
  }
}

// Every response of the Worker's own leaves with the same headers; one an API response sets for
// itself (cache-control) is kept. A page fetched from the assets never gets them.
export function secure(headers: Headers, requestId: string): void {
  headers.set('x-request-id', requestId)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  // An API response is data, never a document: nothing may frame it, run it or embed it from
  // another origin. (A page's policy is the meta its build wrote plus the line assemble adds.)
  headers.set('content-security-policy', API_POLICY) // @nosdk
  headers.set('cross-origin-resource-policy', 'same-origin') // @nosdk
  // @sdk-start
  // A response that sets its own policy (the SDK's frame document, its script files) keeps it.
  if (!headers.has('content-security-policy')) headers.set('content-security-policy', API_POLICY)
  if (!headers.has('cross-origin-resource-policy')) {
    headers.set('cross-origin-resource-policy', 'same-origin')
  }
  // @sdk-end
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store')
}

// Mounted on /api/* only: a static file's response never passes through it.
export const rootMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = performance.now()
  const requestId = resolveRequestId(c.req.raw.headers)
  c.set('requestId', requestId)
  const log = createLogger({ level: logLevel(c.env), bindings: { requestId } })

  try {
    await next()
  } catch (error) {
    // Hono hands an Error to handleError; this is a value that is not one.
    c.res = errorResponse(error, requestId, log)
  }

  try {
    secure(c.res.headers, requestId)
  } catch {
    // A response another fetch returned has immutable headers: copy it.
    c.res = new Response(c.res.body, c.res)
    secure(c.res.headers, requestId)
  }
  logRequest(log, c.req.raw, c.res, started)
}

// A thrown error becomes the envelope here, and only here (error-handler.ts builds it).
export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  const requestId = c.get('requestId') ?? resolveRequestId(c.req.raw.headers)
  const log = createLogger({ level: logLevel(c.env), bindings: { requestId } })
  const response = errorResponse(error, requestId, log)
  // Outside /api the root middleware does not run: a refusal still carries the headers.
  secure(response.headers, requestId)
  return response
}

// The app every route runs in: the root middleware on `scope`, the error handler on everything.
// The entry mounts the routers on it; a test mounts one router alone on a fresh one.
export function rootApp(scope = '/api/*'): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  app.use(scope, rootMiddleware)
  app.onError(handleError)
  return app
}
