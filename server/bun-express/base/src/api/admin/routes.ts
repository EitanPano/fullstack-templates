// routes.ts belongs: the admin namespace's router, mounted at /api/admin by config/routes.ts.
// It applies the one gate first, then mounts each admin entity's router (one line each).
// It does not belong: an endpoint, a rule or a query (the entity's own files), or a second gate.
//
// `admin` is a namespace, not an entity: an entity is `api/admin/<entity>/` (copy `api/entity/`),
// its paths are `/api/admin/<entity>`, and its router is mounted here:
//   router.use('/lead', leadRoutes)
// The gate is on the namespace, so a route inside it cannot ship without it, and the same
// in every environment. An unknown path under it is the JSON 404 for a caller the gate admits.
import { Router } from 'express'

import { requireRole } from '../../middleware/role' // @auth
import { AppError } from '../../services/utils/error' // @noauth

const router = Router()

// @auth-start
// Anonymous is a 401, a signed-in caller without the admin role a 403.
router.use(requireRole('admin'))
// @auth-end
// @noauth-start
// No accounts, so no caller to admit: every request is refused until the product writes its own
// gate here (for example a check of the identity its host or proxy puts in front of the API).
router.use((_req, _res, next) => {
  next(new AppError('forbidden', 'the admin API has no gate yet'))
})
// @noauth-end

export default router
