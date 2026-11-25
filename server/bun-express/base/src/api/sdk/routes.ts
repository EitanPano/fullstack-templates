// routes.ts belongs: the SDK namespace's router, mounted at /api/sdk/v1 by config/routes.ts. It
// applies the one gate first (CORS for this namespace, the key, the rate limit), then reads a
// JSON body (at most SDK_MAX_BODY_BYTES, after the gate and the frame-only guard), then mounts
// each SDK entity's router (one line each).
// It does not belong: an endpoint, a rule or a query (the entity's own files), or a second gate.
//
// `sdk` is a namespace, not an entity: an entity is `api/sdk/<entity>/` (copy `api/sdk/config/`),
// its paths are `/api/sdk/v1/<entity>`, and its router is mounted here:
//   router.use('/unit', unitRoutes)
// An entity only the frame calls (a write the host page must not make) is mounted with
// `frameOnly`, above `endPreflight`:
//   router.use('/message', frameOnly, sdkJson, messageRoutes)
// One mounted without it is readable by the host page, so it never issues or accepts anything
// that counts. Telemetry has no limit of its own: the namespace's two limits count it. A write
// from the frame, like `message`, is the entity that takes a limit of its own on its route.
// Within `v1` the namespace only adds: a new endpoint, a new optional request field or a new
// response field. A removal or a change is a `v2` beside it, mounted at /api/sdk/v2 by
// config/routes.ts, while a build that calls `v1` is still in use. The loader and frame files
// (/api/sdk/dist, /api/sdk/frame) are not here: they carry no key (middleware/sdk-files.ts).
import express, { Router } from 'express'

import { SDK_MAX_BODY_BYTES } from '../../config/constants'
import { endPreflight, frameOnly, sdkGate } from '../../middleware/sdk-gate'
import configRoutes from './config/routes'
import telemetryRoutes from './telemetry/routes'

const router = Router()

router.use(sdkGate)

// server.ts leaves this namespace to the router: no body is read before the gate, and a
// frame-only entity's guard has run before its body is.
const sdkJson = express.json({ limit: SDK_MAX_BODY_BYTES })

// Frame-only entities are mounted here, so that their guard answers a preflight first.
router.use('/telemetry', frameOnly, sdkJson, telemetryRoutes)

router.use(endPreflight, sdkJson)

router.use('/config', configRoutes)

export default router
