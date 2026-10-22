// schema.ts belongs: the user module's zod request and response schemas and their OpenAPI
// registration. It is the leaf of the module. It does not belong: business rules, data access
// or anything that touches Express. The TypeScript shapes live in models/user/type.ts; each
// schema here is checked against its type with `satisfies`, so the two cannot drift apart.
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { USER_LIMITS } from '../../models/user/constants'
import { UserRole, UserStatus } from '../../models/user/enum'
import type { PublicUser as PublicUserType, UpdateUserInput } from '../../models/user/type'
import { errorResponses, jsonBody, jsonResponse } from '../../services/utils/openapi'
import { PageQuery, pageOf } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

export const PublicUser = z
  .object({
    id: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    role: z.enum(UserRole),
    status: z.enum(UserStatus),
    emailVerifiedAt: z.iso.datetime().nullable(),
    phoneVerifiedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('PublicUser') satisfies z.ZodType<PublicUserType>

// `null` clears the phone, an absent field leaves it unchanged.
export const UpdateMeBody = z
  .object({
    phone: z.string().regex(USER_LIMITS.phone.pattern).nullable().optional(),
  })
  .openapi('UpdateMeBody') satisfies z.ZodType<UpdateUserInput>

// HTTP-only: the id arrives as a path parameter and never leaves the route.
export const UserIdParams = z.object({ id: z.string().min(1) })
export type UserIdParams = z.infer<typeof UserIdParams>

export const ListUserQuery = PageQuery

export const UserPage = pageOf(PublicUser, 'User')

export function registerUser(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'get',
    path: '/api/user/me',
    tags: ['user'],
    summary: 'Get the signed-in user',
    responses: {
      200: jsonResponse('The signed-in user', PublicUser),
      ...errorResponses(401, 500),
    },
  })
  registry.registerPath({
    method: 'patch',
    path: '/api/user/me',
    tags: ['user'],
    summary: 'Update the signed-in user',
    request: { body: jsonBody(UpdateMeBody) },
    responses: {
      200: jsonResponse('The updated user', PublicUser),
      ...errorResponses(400, 401, 409, 500),
    },
  })
  registry.registerPath({
    method: 'get',
    path: '/api/user',
    tags: ['user'],
    summary: 'List users (admin)',
    request: { query: ListUserQuery },
    responses: {
      200: jsonResponse('A page of users', UserPage),
      ...errorResponses(400, 401, 403, 500),
    },
  })
  registry.registerPath({
    method: 'get',
    path: '/api/user/{id}',
    tags: ['user'],
    summary: 'Get a user by id (admin)',
    request: { params: UserIdParams },
    responses: {
      200: jsonResponse('The user', PublicUser),
      ...errorResponses(401, 403, 404, 500),
    },
  })
}
