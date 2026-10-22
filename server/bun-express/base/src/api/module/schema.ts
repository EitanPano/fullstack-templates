// schema.ts belongs: this directory's contract, the zod schemas that validate requests, type
// responses and produce openapi.json, plus the registration of each endpoint. It is the leaf
// of the directory: route, controller and service import it, it imports only models/ and
// services/utils/.
// It does not belong: business rules (service.ts), data access (repository.ts) or HTTP
// handling (route.ts).
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { MODULE_LIMITS } from '../../models/module/constants'
import { ModuleStatus } from '../../models/module/enum'
import type {
  CreateModuleInput,
  PublicModule as PublicModuleShape,
  UpdateModuleInput,
} from '../../models/module/type'
import { errorResponses, jsonBody, jsonResponse } from '../../services/utils/openapi'
import { PageQuery, pageOf } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// The shape lives in models/module/type.ts; `satisfies` makes the compiler hold each schema
// to it, so nothing is declared twice.
export const PublicModule = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(ModuleStatus),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Module') satisfies z.ZodType<PublicModuleShape>

export const CreateModuleBody = z
  .object({
    name: z.string().trim().min(MODULE_LIMITS.name.min).max(MODULE_LIMITS.name.max),
  })
  .openapi('CreateModuleBody') satisfies z.ZodType<CreateModuleInput>

// A PATCH with nothing in it is a client mistake, not a no-op: it answers 400.
export const UpdateModuleBody = z
  .object({
    name: z.string().trim().min(MODULE_LIMITS.name.min).max(MODULE_LIMITS.name.max).optional(),
    status: z.enum(ModuleStatus).optional(),
  })
  .refine((body) => body.name !== undefined || body.status !== undefined, {
    message: 'nothing to update',
  })
  .openapi('UpdateModuleBody') satisfies z.ZodType<UpdateModuleInput>

// HTTP-only shape: there is no models/ type to satisfy.
export const ModuleIdParams = z.object({ id: z.string().min(1) })
export type ModuleIdParams = z.infer<typeof ModuleIdParams>

export const ListModuleQuery = PageQuery
export const ModulePage = pageOf(PublicModule, 'Module')

export function registerModule(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'get',
    path: '/api/module',
    tags: ['module'],
    summary: 'List modules',
    request: { query: ListModuleQuery },
    responses: {
      200: jsonResponse('A page of modules', ModulePage),
      ...errorResponses(400, 500),
    },
  })
  registry.registerPath({
    method: 'get',
    path: '/api/module/{id}',
    tags: ['module'],
    summary: 'Get a module',
    request: { params: ModuleIdParams },
    responses: {
      200: jsonResponse('The module', PublicModule),
      ...errorResponses(400, 404, 500),
    },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/module',
    tags: ['module'],
    summary: 'Create a module',
    request: { body: jsonBody(CreateModuleBody) },
    responses: {
      201: jsonResponse('The created module', PublicModule),
      ...errorResponses(400, 401, 500), // @auth
      ...errorResponses(400, 500), // @noauth
    },
  })
  registry.registerPath({
    method: 'patch',
    path: '/api/module/{id}',
    tags: ['module'],
    summary: 'Update a module',
    request: { params: ModuleIdParams, body: jsonBody(UpdateModuleBody) },
    responses: {
      200: jsonResponse('The updated module', PublicModule),
      ...errorResponses(400, 401, 404, 500), // @auth
      ...errorResponses(400, 404, 500), // @noauth
    },
  })
  registry.registerPath({
    method: 'delete',
    path: '/api/module/{id}',
    tags: ['module'],
    summary: 'Delete a module (admin only)', // @auth
    summary: 'Delete a module', // @noauth
    request: { params: ModuleIdParams },
    responses: {
      204: { description: 'Deleted' },
      ...errorResponses(400, 401, 403, 404, 500), // @auth
      ...errorResponses(400, 404, 500), // @noauth
    },
  })
}
