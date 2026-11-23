// controller.ts belongs: this directory's business logic and its HTTP handlers, one exported
// handler per endpoint, named after its operation (`createEntity`). A handler reads the input
// validate() parsed (readInput), resolves the caller, applies the rules, reads and writes // @auth
// validate() parsed (readInput), applies the rules, reads and writes // @noauth
// through service.ts, publishes events, calls providers and sends the status and body.
// Logic another api/ directory, a job or a script needs is exported as a typed rule function
// (no `req`, no `res`; api/user/ has several) that its handler calls too. Nothing outside // @auth
// (no `req`, no `res`) that its handler calls too. Nothing outside // @noauth
// this directory needs any yet, so there is none.
// It does not belong: middleware (routes.ts), queries (service.ts) or schemas (schema.ts).
import { randomUUID } from 'node:crypto'

import type { Request, Response } from 'express'

import { requireCaller } from '../../middleware/auth' // @auth
import { readInput } from '../../middleware/validate'
import type { Caller } from '../../models/auth/type' // @auth
import { EntityStatus } from '../../models/entity/enum'
import type { EntityRecord } from '../../models/entity/interface'
import type { PublicEntity } from '../../models/entity/type'
import type { UserRole } from '../../models/user/enum' // @auth
import { publish } from '../../services/event'
import { AppError } from '../../services/utils/error'
import {
  createEntityRequest,
  deleteEntityRequest,
  getEntityRequest,
  listEntityRequest,
  updateEntityRequest,
} from './schema'
import * as service from './service'

function toPublic(record: EntityRecord): PublicEntity {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

// @auth-start
// routes.ts already gates delete with requireRole; the handler checks the caller too, so an
// endpoint mounted without its gate fails closed.
function assertRole(caller: Caller, role: UserRole): void {
  if (caller.role !== role) throw new AppError('forbidden', 'insufficient role')
}

// @auth-end
async function requireRecord(id: string): Promise<EntityRecord> {
  const record = await service.findEntityById(id)
  if (record === undefined) throw new AppError('not_found', 'entity not found')
  return record
}

export async function listEntity(_req: Request, res: Response): Promise<void> {
  const { query } = readInput(res, listEntityRequest)
  const page = await service.listEntities({ cursor: query.cursor, limit: query.limit })
  res.json({ items: page.items.map(toPublic), nextCursor: page.nextCursor })
}

export async function getEntity(_req: Request, res: Response): Promise<void> {
  const { params } = readInput(res, getEntityRequest)
  res.json(toPublic(await requireRecord(params.id)))
}

// @auth-start
// Any authenticated caller may create. An entity owned by its creator would store
// `requireCaller(res).id` in an `ownerId` field here; this template has no owner.
// @auth-end
// The event is published after the write: subscribers react detached from this request.
export async function createEntity(_req: Request, res: Response): Promise<void> {
  const { body } = readInput(res, createEntityRequest)
  const now = new Date()
  const record = await service.createEntity({
    id: randomUUID(),
    name: body.name,
    status: EntityStatus.active,
    createdAt: now,
    updatedAt: now,
  })
  await publish('entity.created', { entityId: record.id })
  res.status(201).json(toPublic(record))
}

// @auth-start
// Any authenticated caller may update. An ownership rule would compare `requireCaller(res).id`
// with the loaded record's `ownerId` and throw `forbidden` on a mismatch; the template has none.
// @auth-end
export async function updateEntity(_req: Request, res: Response): Promise<void> {
  const { params, body } = readInput(res, updateEntityRequest)
  const record = await requireRecord(params.id)
  const saved = await service.updateEntity({
    ...record,
    name: body.name ?? record.name,
    status: body.status ?? record.status,
    updatedAt: new Date(),
  })
  res.json(toPublic(saved))
}

export async function deleteEntity(_req: Request, res: Response): Promise<void> {
  const { params } = readInput(res, deleteEntityRequest)
  assertRole(requireCaller(res), 'admin') // @auth
  if (!(await service.deleteEntity(params.id))) {
    throw new AppError('not_found', 'entity not found')
  }
  res.status(204).end()
}
