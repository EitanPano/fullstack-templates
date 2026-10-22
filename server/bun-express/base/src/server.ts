import cookieParser from 'cookie-parser' // @auth
import cors from 'cors'
import express, { Router } from 'express'
import helmet from 'helmet'

import { corsOptions } from './config/cors'
import { env } from './config/env'
import { mountRoutes } from './config/routes'
import { errorHandler } from './middleware/error-handler'
import { notFound } from './middleware/not-found'
import { requestId } from './middleware/request-id'
import { requestLog } from './middleware/request-log'
import { buildOpenApiDocument } from './openapi'

// The app, assembled in one place: middleware, the /api router built from the module list,
// then the 404 and the error handler last. server.ts imports middleware/, config/ and
// openapi.ts and nothing from api/ (routes come through config/routes.ts) or infra/. Nothing
// here listens or touches infrastructure: tests import `app` as is, and index.ts starts the
// infra, listens and handles shutdown.
export const app = express()

// Do not advertise the framework.
app.disable('x-powered-by')
// Behind a proxy, req.ip and secure cookies need the configured hop count. // @auth
// Behind a proxy, req.ip needs the configured hop count. // @noauth
app.set('trust proxy', env.TRUST_PROXY)
// Security headers first so every response, errors included, carries them.
app.use(helmet())
// CORS only when origins are configured; the default API client is the Next.js server.
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
const api = Router()
mountRoutes(api)
app.use('/api', api)

// The generated contract, served for tooling.
app.get('/openapi.json', (_req, res) => {
  res.json(buildOpenApiDocument())
})

// Unmatched requests, then every error, last.
app.use(notFound)
app.use(errorHandler)
