// service.ts belongs: this directory's business rules, private to it. It throws AppError,
// maps stored records to response shapes and, when the engine has transactions, owns them.
// It does not belong: HTTP (route.ts), request parsing (schema.ts) or queries (repository.ts).
import { randomUUID } from 'node:crypto'

import type { Caller } from '../../models/auth/type' // @auth
import { ModuleStatus } from '../../models/module/enum'
import type { ModuleRecord } from '../../models/module/interface'
import type { CreateModuleInput, PublicModule, UpdateModuleInput } from '../../models/module/type'
import type { UserRole } from '../../models/user/enum' // @auth
import { AppError } from '../../services/utils/error'
import type { Page, PageQuery } from '../../services/utils/pagination'
import * as repository from './repository'

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
// The route gate (requireRole) already refuses the wrong role; the service checks the caller
// it was handed too, so a controller called from another api/ directory cannot skip the rule.
function assertRole(caller: Caller, role: UserRole): void {
  if (caller.role !== role) throw new AppError('forbidden', 'insufficient role')
}

// @auth-end
async function requireRecord(id: string): Promise<ModuleRecord> {
  const record = await repository.findById(id)
  if (record === undefined) throw new AppError('not_found', 'module not found')
  return record
}

export async function listModule(query: PageQuery): Promise<Page<PublicModule>> {
  const page = await repository.list({ cursor: query.cursor, limit: query.limit })
  return { items: page.items.map(toPublic), nextCursor: page.nextCursor }
}

export async function getModule(id: string): Promise<PublicModule> {
  return toPublic(await requireRecord(id))
}

// @auth-start
// Any authenticated caller may create. An entity owned by its creator would store `caller.id`
// in an `ownerId` field here; this template has no owner, so there is no ownership rule.
export async function createModule(
  input: CreateModuleInput,
  _caller: Caller,
): Promise<PublicModule> {
// @auth-end
// @noauth-start
export async function createModule(input: CreateModuleInput): Promise<PublicModule> {
// @noauth-end
  const now = new Date()
  const record = await repository.insert({
    id: randomUUID(),
    name: input.name,
    status: ModuleStatus.active,
    createdAt: now,
    updatedAt: now,
  })
  return toPublic(record)
}

// @auth-start
// Any authenticated caller may update. An ownership rule would compare `caller.id` with the
// loaded record's `ownerId` and throw `forbidden` on a mismatch; the template has none.
export async function updateModule(
  id: string,
  input: UpdateModuleInput,
  _caller: Caller,
): Promise<PublicModule> {
// @auth-end
// @noauth-start
export async function updateModule(id: string, input: UpdateModuleInput): Promise<PublicModule> {
// @noauth-end
  const record = await requireRecord(id)
  const saved = await repository.update({
    ...record,
    name: input.name ?? record.name,
    status: input.status ?? record.status,
    updatedAt: new Date(),
  })
  return toPublic(saved)
}

// @auth-start
export async function deleteModule(id: string, caller: Caller): Promise<void> {
  assertRole(caller, 'admin')
// @auth-end
// @noauth-start
export async function deleteModule(id: string): Promise<void> {
// @noauth-end
  if (!(await repository.remove(id))) throw new AppError('not_found', 'module not found')
}
