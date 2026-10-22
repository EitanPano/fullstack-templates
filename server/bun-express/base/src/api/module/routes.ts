// routes.ts belongs: this directory's router. Each endpoint is one line: the middleware it
// needs (auth, role gate), validation, then the controller's handler; the middleware is // @auth
// needs, validation, then the controller's handler; the middleware is // @noauth
// built once above the table.
// It does not belong: request handling or business rules (controller.ts), queries (service.ts)
// or schemas (schema.ts).
//
// Reference module: README > Adding a module explains how to copy it.
// @noauth-start
// Every endpoint is public: the product has no accounts. A plan that adds them mounts the
// gate here per endpoint and the handler resolves the caller; the harness's `--auth full`
// scaffold shows the pattern.
// @noauth-end
import { Router } from 'express'

import { requireAuth } from '../../middleware/auth' // @auth
import { requireRole } from '../../middleware/role' // @auth
import { validate } from '../../middleware/validate'
import { createModule, deleteModule, getModule, listModule, updateModule } from './controller'
import {
  createModuleRequest,
  deleteModuleRequest,
  getModuleRequest,
  listModuleRequest,
  updateModuleRequest,
} from './schema'

const router = Router()

const requireAdmin = requireRole('admin') // @auth

const validateList = validate(listModuleRequest)
const validateGet = validate(getModuleRequest)
const validateCreate = validate(createModuleRequest)
const validateUpdate = validate(updateModuleRequest)
const validateDelete = validate(deleteModuleRequest)

router.get('/', validateList, listModule)
router.get('/:id', validateGet, getModule)
router.post('/', requireAuth, validateCreate, createModule) // @auth
router.post('/', validateCreate, createModule) // @noauth
router.patch('/:id', requireAuth, validateUpdate, updateModule) // @auth
router.patch('/:id', validateUpdate, updateModule) // @noauth
router.delete('/:id', requireAdmin, validateDelete, deleteModule) // @auth
router.delete('/:id', validateDelete, deleteModule) // @noauth

export default router
