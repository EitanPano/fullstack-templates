// controller.ts belongs: this directory's business logic and its HTTP handlers, one exported
// handler per endpoint, named after its operation (`createModule`). A handler reads the input
// validate() parsed (readInput), applies the rules, reads and writes through service.ts and sends
// the response. Logic another module or a job needs is exported as a typed rule function (no
// `ctx`) that its handler calls too; nothing needs one yet, so there is none.
// It does not belong: the gate chain (functions/api/module/), queries (service.ts) or schemas
// (schema.ts).
//
// Reference module: AGENTS.md > Adding a module explains how to copy it.
import {
  createModuleRequest,
  deleteModuleRequest,
  getModuleRequest,
  listModuleRequest,
  updateModuleRequest,
} from './schema'

import { json, noContent, type Context } from '../../middleware/handler'
import { readInput } from '../../middleware/validate'
import { ModuleStatus } from '../../models/module/enum'
import type { ModuleRecord } from '../../models/module/interface'
import type { PublicModule } from '../../models/module/type'
import { AppError } from '../../services/utils/error'
import * as service from './service'

function toPublic(record: ModuleRecord): PublicModule {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

async function requireRecord(ctx: Context, id: string): Promise<ModuleRecord> {
  const record = await service.findModuleById(ctx.db, id)
  if (record === undefined) throw new AppError('not_found', 'module not found')
  return record
}

export async function listModule(ctx: Context): Promise<Response> {
  const { query } = readInput(ctx, listModuleRequest)
  const page = await service.listModules(ctx.db, { cursor: query.cursor, limit: query.limit })
  return json({ items: page.items.map(toPublic), nextCursor: page.nextCursor })
}

export async function getModule(ctx: Context): Promise<Response> {
  const { params } = readInput(ctx, getModuleRequest)
  return json(toPublic(await requireRecord(ctx, params.id)))
}

// Ids are made here, never by the database or the client.
export async function createModule(ctx: Context): Promise<Response> {
  const { body } = readInput(ctx, createModuleRequest)
  const now = new Date()
  const record = await service.createModule(ctx.db, {
    id: crypto.randomUUID(),
    name: body.name,
    status: ModuleStatus.active,
    createdAt: now,
    updatedAt: now,
  })
  return json(toPublic(record), 201)
}

export async function updateModule(ctx: Context): Promise<Response> {
  const { params, body } = readInput(ctx, updateModuleRequest)
  const record = await requireRecord(ctx, params.id)
  const saved = await service.updateModule(ctx.db, {
    ...record,
    name: body.name ?? record.name,
    status: body.status ?? record.status,
    updatedAt: new Date(),
  })
  // The row can vanish between the read and the write; the statement says so.
  if (saved === undefined) throw new AppError('not_found', 'module not found')
  return json(toPublic(saved))
}

export async function deleteModule(ctx: Context): Promise<Response> {
  const { params } = readInput(ctx, deleteModuleRequest)
  if (!(await service.deleteModule(ctx.db, params.id))) {
    throw new AppError('not_found', 'module not found')
  }
  return noContent()
}
