// routes.ts belongs: this directory's router. Each endpoint is one line: the middleware it
// needs (auth, role gate), validation, then the controller's handler; the middleware is // @auth
// needs, validation, then the controller's handler; the middleware is // @noauth
// built once above the table.
// It does not belong: request handling or business rules (controller.ts), queries (service.ts)
// or schemas (schema.ts).
//
// Reference entity: AGENTS.md > Adding an entity explains how to copy it.
// @noauth-start
// Every endpoint is public: the product has no accounts. A plan that adds them mounts the
// gate here per endpoint and the handler resolves the caller; a scaffold generated with
// the `auth` flag on shows the pattern.
// @noauth-end
import { Router } from 'express'

import { requireAuth } from '../../middleware/auth' // @auth
import { requireRole } from '../../middleware/role' // @auth
import { validate } from '../../middleware/validate'
import { createEntity, deleteEntity, getEntity, listEntity, updateEntity } from './controller'
import {
  createEntityRequest,
  deleteEntityRequest,
  getEntityRequest,
  listEntityRequest,
  updateEntityRequest,
} from './schema'

const router = Router()

const requireAdmin = requireRole('admin') // @auth

const validateList = validate(listEntityRequest)
const validateGet = validate(getEntityRequest)
const validateCreate = validate(createEntityRequest)
const validateUpdate = validate(updateEntityRequest)
const validateDelete = validate(deleteEntityRequest)

router.get('/', validateList, listEntity)
router.get('/:id', validateGet, getEntity)
router.post('/', requireAuth, validateCreate, createEntity) // @auth
router.post('/', validateCreate, createEntity) // @noauth
router.patch('/:id', requireAuth, validateUpdate, updateEntity) // @auth
router.patch('/:id', validateUpdate, updateEntity) // @noauth
router.delete('/:id', requireAdmin, validateDelete, deleteEntity) // @auth
router.delete('/:id', validateDelete, deleteEntity) // @noauth

export default router
