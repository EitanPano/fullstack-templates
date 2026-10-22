// controller.ts belongs: this directory's business logic and its HTTP handlers, one exported
// handler per endpoint, named after its operation (`createModule`). A handler reads the input
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
import { ModuleStatus } from '../../models/module/enum'
import type { ModuleRecord } from '../../models/module/interface'
import type { PublicModule } from '../../models/module/type'
import type { UserRole } from '../../models/user/enum' // @auth
import { publish } from '../../services/event'
import { AppError } from '../../services/utils/error'
import {
  createModuleRequest,
  deleteModuleRequest,
  getModuleRequest,
  listModuleRequest,
  updateModuleRequest,
} from './schema'
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

// @auth-start
// routes.ts already gates delete with requireRole; the handler checks the caller too, so an
// endpoint mounted without its gate fails closed.
function assertRole(caller: Caller, role: UserRole): void {
  if (caller.role !== role) throw new AppError('forbidden', 'insufficient role')
}

// @auth-end
async function requireRecord(id: string): Promise<ModuleRecord> {
  const record = await service.findModuleById(id)
  if (record === undefined) throw new AppError('not_found', 'module not found')
  return record
}

export async function listModule(_req: Request, res: Response): Promise<void> {
  const { query } = readInput(res, listModuleRequest)
  const page = await service.listModules({ cursor: query.cursor, limit: query.limit })
  res.json({ items: page.items.map(toPublic), nextCursor: page.nextCursor })
}

export async function getModule(_req: Request, res: Response): Promise<void> {
  const { params } = readInput(res, getModuleRequest)
  res.json(toPublic(await requireRecord(params.id)))
}

// @auth-start
// Any authenticated caller may create. An entity owned by its creator would store
// `requireCaller(res).id` in an `ownerId` field here; this template has no owner.
// @auth-end
// The event is published after the write: subscribers react detached from this request.
export async function createModule(_req: Request, res: Response): Promise<void> {
  const { body } = readInput(res, createModuleRequest)
  const now = new Date()
  const record = await service.createModule({
    id: randomUUID(),
    name: body.name,
    status: ModuleStatus.active,
    createdAt: now,
    updatedAt: now,
  })
  await publish('module.created', { moduleId: record.id })
  res.status(201).json(toPublic(record))
}

// @auth-start
// Any authenticated caller may update. An ownership rule would compare `requireCaller(res).id`
// with the loaded record's `ownerId` and throw `forbidden` on a mismatch; the template has none.
// @auth-end
export async function updateModule(_req: Request, res: Response): Promise<void> {
  const { params, body } = readInput(res, updateModuleRequest)
  const record = await requireRecord(params.id)
  const saved = await service.updateModule({
    ...record,
    name: body.name ?? record.name,
    status: body.status ?? record.status,
    updatedAt: new Date(),
  })
  res.json(toPublic(saved))
}

export async function deleteModule(_req: Request, res: Response): Promise<void> {
  const { params } = readInput(res, deleteModuleRequest)
  assertRole(requireCaller(res), 'admin') // @auth
  if (!(await service.deleteModule(params.id))) {
    throw new AppError('not_found', 'module not found')
  }
  res.status(204).end()
}
