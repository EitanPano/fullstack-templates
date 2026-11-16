// module.ts belongs: the reference module's contract: the schemas the route validates with and
// the page types its calls with, the value set and the limits of its data. One file per module.
// It does not belong: the stored shape (server/models/module) or any business rule.
import { z } from 'zod'

import { PageQuery, pageOf } from './page'

export const ModuleStatus = { active: 'active', archived: 'archived' } as const
export type ModuleStatus = (typeof ModuleStatus)[keyof typeof ModuleStatus]

export const MODULE_LIMITS = { name: { min: 1, max: 100 } } as const

const name = z.string().trim().min(MODULE_LIMITS.name.min).max(MODULE_LIMITS.name.max)

export const PublicModule = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(ModuleStatus),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const CreateModuleBody = z.object({ name })

// A PATCH with nothing in it is a client mistake, not a no-op: it answers 400.
export const UpdateModuleBody = z
  .object({ name: name.optional(), status: z.enum(ModuleStatus).optional() })
  .refine((body) => body.name !== undefined || body.status !== undefined, {
    message: 'nothing to update',
  })

export const ModuleIdParams = z.object({ id: z.string().min(1) })

export const ModulePage = pageOf(PublicModule)

// The request parts each endpoint validates: the route hands one to validate(), the controller
// reads the parsed result back with readInput(), so the two cannot disagree.
export const listModuleRequest = { query: PageQuery }
export const getModuleRequest = { params: ModuleIdParams }
export const createModuleRequest = { body: CreateModuleBody }
export const updateModuleRequest = { params: ModuleIdParams, body: UpdateModuleBody }
export const deleteModuleRequest = { params: ModuleIdParams }

export type PublicModule = z.infer<typeof PublicModule>
export type CreateModuleInput = z.infer<typeof CreateModuleBody>
export type UpdateModuleInput = z.infer<typeof UpdateModuleBody>
export type ModulePage = z.infer<typeof ModulePage>
