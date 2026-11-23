// schema.ts belongs: this directory's contract, the zod schemas that validate requests, type
// responses and produce openapi.json, the request parts each endpoint validates, plus the
// registration of each endpoint. It is the leaf of the directory: routes and controller import
// it, it imports only models/ and services/utils/.
// It does not belong: business rules or HTTP handling (controller.ts) or data access
// (service.ts).
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { ENTITY_LIMITS } from '../../models/entity/constants'
import { EntityStatus } from '../../models/entity/enum'
import type {
  CreateEntityInput,
  PublicEntity as PublicEntityShape,
  UpdateEntityInput,
} from '../../models/entity/type'
import { errorResponses, jsonBody, jsonResponse } from '../../services/utils/openapi'
import { PageQuery, pageOf } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// The shape lives in models/entity/type.ts; `satisfies` makes the compiler hold each schema
// to it, so nothing is declared twice.
export const PublicEntity = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(EntityStatus),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Entity') satisfies z.ZodType<PublicEntityShape>

export const CreateEntityBody = z
  .object({
    name: z.string().trim().min(ENTITY_LIMITS.name.min).max(ENTITY_LIMITS.name.max),
  })
  .openapi('CreateEntityBody') satisfies z.ZodType<CreateEntityInput>

// A PATCH with nothing in it is a client mistake, not a no-op: it answers 400.
export const UpdateEntityBody = z
  .object({
    name: z.string().trim().min(ENTITY_LIMITS.name.min).max(ENTITY_LIMITS.name.max).optional(),
    status: z.enum(EntityStatus).optional(),
  })
  .refine((body) => body.name !== undefined || body.status !== undefined, {
    message: 'nothing to update',
  })
  .openapi('UpdateEntityBody') satisfies z.ZodType<UpdateEntityInput>

// HTTP-only shape: there is no models/ type to satisfy.
export const EntityIdParams = z.object({ id: z.string().min(1) })
export type EntityIdParams = z.infer<typeof EntityIdParams>

export const ListEntityQuery = PageQuery
export const EntityPage = pageOf(PublicEntity, 'Entity')

// The request parts each endpoint validates: routes.ts hands one to validate(), the controller
// reads the parsed result back with readInput(), so the two cannot disagree.
export const listEntityRequest = { query: ListEntityQuery }
export const getEntityRequest = { params: EntityIdParams }
export const createEntityRequest = { body: CreateEntityBody }
export const updateEntityRequest = { params: EntityIdParams, body: UpdateEntityBody }
export const deleteEntityRequest = { params: EntityIdParams }

export function registerEntity(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'get',
    path: '/api/entity',
    tags: ['entity'],
    summary: 'List entities',
    request: { query: ListEntityQuery },
    responses: {
      200: jsonResponse('A page of entities', EntityPage),
      ...errorResponses(400, 500),
    },
  })
  registry.registerPath({
    method: 'get',
    path: '/api/entity/{id}',
    tags: ['entity'],
    summary: 'Get an entity',
    request: { params: EntityIdParams },
    responses: {
      200: jsonResponse('The entity', PublicEntity),
      ...errorResponses(400, 404, 500),
    },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/entity',
    tags: ['entity'],
    summary: 'Create an entity',
    request: { body: jsonBody(CreateEntityBody) },
    responses: {
      201: jsonResponse('The created entity', PublicEntity),
      ...errorResponses(400, 401, 500), // @auth
      ...errorResponses(400, 500), // @noauth
    },
  })
  registry.registerPath({
    method: 'patch',
    path: '/api/entity/{id}',
    tags: ['entity'],
    summary: 'Update an entity',
    request: { params: EntityIdParams, body: jsonBody(UpdateEntityBody) },
    responses: {
      200: jsonResponse('The updated entity', PublicEntity),
      ...errorResponses(400, 401, 404, 500), // @auth
      ...errorResponses(400, 404, 500), // @noauth
    },
  })
  registry.registerPath({
    method: 'delete',
    path: '/api/entity/{id}',
    tags: ['entity'],
    summary: 'Delete an entity (admin only)', // @auth
    summary: 'Delete an entity', // @noauth
    request: { params: EntityIdParams },
    responses: {
      204: { description: 'Deleted' },
      ...errorResponses(400, 401, 403, 404, 500), // @auth
      ...errorResponses(400, 404, 500), // @noauth
    },
  })
}
