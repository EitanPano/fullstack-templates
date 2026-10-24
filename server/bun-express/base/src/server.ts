import cookieParser from 'cookie-parser' // @auth
import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'

import { corsOptions } from './config/cors'
import { env } from './config/env'
import { registerRoutes } from './config/routes'
import { errorHandler } from './middleware/error-handler'
import { notFound } from './middleware/not-found'
import { requestId } from './middleware/request-id'
import { requestLog } from './middleware/request-log'
import { staticFiles } from './middleware/static'
import { buildOpenApiDocument } from './openapi'

// The app, assembled in one place: middleware, every module mounted under /api by
// config/routes.ts, then the 404 and the error handler last. server.ts imports middleware/,
// config/ and openapi.ts and nothing from api/ (routes come through config/routes.ts) or infra/.
// Nothing here listens or touches infrastructure: tests import `app` as is, or call
// `createApp(dir)` to serve a fixture directory, and index.ts starts the infra, listens and
// handles shutdown.
export function createApp(staticDir: string | undefined = env.STATIC_DIR): Express {
  const app = express()

  // Do not advertise the framework.
  app.disable('x-powered-by')
  // Behind a proxy, req.ip and secure cookies need the configured hop count. // @auth
  // Behind a proxy, req.ip needs the configured hop count. // @noauth
  app.set('trust proxy', env.TRUST_PROXY)
  // Security headers first so every response, errors included, carries them.
  app.use(helmet())
  // CORS only when origins are configured; the browser reaches the API on its own origin.
  if (corsOptions !== undefined) app.use(cors(corsOptions))
  // The request id must exist before anything logs or fails.
  app.use(requestId)
  // One log line per request.
  app.use(requestLog)
  // Bodies are JSON only and capped; oversize becomes a 413 envelope in the error handler.
  app.use(express.json({ limit: '1mb' }))
  // Cookies are parsed once here for the auth resolver. // @auth
  app.use(cookieParser()) // @auth

  // One line per module lives in config/routes.ts.
  registerRoutes(app)

  // The generated contract, served for tooling.
  app.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument())
  })

  // The built SPA, only when configured: after every API route and the contract, before the 404.
  if (staticDir !== undefined) app.use(staticFiles(staticDir))

  // Unmatched requests, then every error, last.
  app.use(notFound)
  app.use(errorHandler)
  return app
}

export const app = createApp()
