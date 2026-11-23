// controller.ts belongs: this directory's business logic and its HTTP handlers, one exported
// handler per endpoint, named after its operation (`createEntity`). A handler reads the input
// validate() parsed (readInput), applies the rules, reads and writes through service.ts and sends
// the response. A rule another entity needs is exported as an async function that takes and returns
// plain data (`db` aside as its first parameter): never a Request, a Response, `ctx` or a Hono
// type, and no module-level state the caller reads, so a service binding can stand in for the
// import. Nothing needs one yet, so there is none.
// It does not belong: the gate chain (routes.ts), queries (service.ts) or schemas
// (schema.ts).
//
// Reference entity: AGENTS.md > Adding an entity explains how to copy it.
import {
  createEntityRequest,
  deleteEntityRequest,
  getEntityRequest,
  listEntityRequest,
  updateEntityRequest,
} from './schema'

import { json, noContent, type Context } from '../../middleware/handler'
import { readInput } from '../../middleware/validate'
import { EntityStatus } from '../../models/entity/enum'
import type { EntityRecord } from '../../models/entity/interface'
import type { PublicEntity } from '../../models/entity/type'
import { AppError } from '../../services/utils/error'
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

async function requireRecord(ctx: Context, id: string): Promise<EntityRecord> {
  const record = await service.findEntityById(ctx.db, id)
  if (record === undefined) throw new AppError('not_found', 'entity not found')
  return record
}

export async function listEntity(ctx: Context): Promise<Response> {
  const { query } = readInput(ctx, listEntityRequest)
  const page = await service.listEntities(ctx.db, { cursor: query.cursor, limit: query.limit })
  return json({ items: page.items.map(toPublic), nextCursor: page.nextCursor })
}

export async function getEntity(ctx: Context): Promise<Response> {
  const { params } = readInput(ctx, getEntityRequest)
  return json(toPublic(await requireRecord(ctx, params.id)))
}

// Ids are made here, never by the database or the client.
export async function createEntity(ctx: Context): Promise<Response> {
  const { body } = readInput(ctx, createEntityRequest)
  const now = new Date()
  const record = await service.createEntity(ctx.db, {
    id: crypto.randomUUID(),
    name: body.name,
    status: EntityStatus.active,
    createdAt: now,
    updatedAt: now,
  })
  return json(toPublic(record), 201)
}

export async function updateEntity(ctx: Context): Promise<Response> {
  const { params, body } = readInput(ctx, updateEntityRequest)
  const record = await requireRecord(ctx, params.id)
  const saved = await service.updateEntity(ctx.db, {
    ...record,
    name: body.name ?? record.name,
    status: body.status ?? record.status,
    updatedAt: new Date(),
  })
  // The row can vanish between the read and the write; the statement says so.
  if (saved === undefined) throw new AppError('not_found', 'entity not found')
  return json(toPublic(saved))
}

export async function deleteEntity(ctx: Context): Promise<Response> {
  const { params } = readInput(ctx, deleteEntityRequest)
  if (!(await service.deleteEntity(ctx.db, params.id))) {
    throw new AppError('not_found', 'entity not found')
  }
  return noContent()
}
