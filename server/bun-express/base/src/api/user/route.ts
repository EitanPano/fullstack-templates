// route.ts belongs: the user module's HTTP adapter. Per endpoint it mounts the middleware the
// endpoint needs, validates the request parts it reads, calls one controller function and sends
// the status and body. It does not belong: business rules (service.ts) or data access.
import { Router } from 'express'

import { requireAuth, requireCaller } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { readInput, validate } from '../../middleware/validate'
import * as controller from './controller'
import { ListUserQuery, UpdateMeBody, UserIdParams } from './schema'

export const userRoute = Router()

const updateMeInput = { body: UpdateMeBody }
const listInput = { query: ListUserQuery }
const getInput = { params: UserIdParams }

// `/me` is mounted before `/:id`, or "me" would be read as an id.
userRoute.get('/me', requireAuth, async (_req, res) => {
  res.json(await controller.getMe({ caller: requireCaller(res) }))
})

userRoute.patch('/me', requireAuth, validate(updateMeInput), async (_req, res) => {
  const { body } = readInput(res, updateMeInput)
  res.json(await controller.updateMe({ caller: requireCaller(res), input: body }))
})

userRoute.get('/', requireRole('admin'), validate(listInput), async (_req, res) => {
  const { query } = readInput(res, listInput)
  res.json(await controller.listUser({ query, caller: requireCaller(res) }))
})

userRoute.get('/:id', requireRole('admin'), validate(getInput), async (_req, res) => {
  const { params } = readInput(res, getInput)
  res.json(await controller.getUser({ id: params.id, caller: requireCaller(res) }))
})
