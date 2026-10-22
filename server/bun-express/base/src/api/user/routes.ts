// routes.ts belongs: the user module's router. Each endpoint is one line: its auth gate,
// validation, then the controller's handler; the middleware is built once above the table.
// It does not belong: request handling (controller.ts).
import { Router } from 'express'

import { requireAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { validate } from '../../middleware/validate'
import { getMe, getUser, listUser, updateMe } from './controller'
import { getUserRequest, listUserRequest, updateMeRequest } from './schema'

const router = Router()

const requireAdmin = requireRole('admin')

const validateUpdateMe = validate(updateMeRequest)
const validateList = validate(listUserRequest)
const validateGet = validate(getUserRequest)

// `/me` is mounted before `/:id`, or "me" would be read as an id.
router.get('/me', requireAuth, getMe)
router.patch('/me', requireAuth, validateUpdateMe, updateMe)
router.get('/', requireAdmin, validateList, listUser)
router.get('/:id', requireAdmin, validateGet, getUser)

export default router
