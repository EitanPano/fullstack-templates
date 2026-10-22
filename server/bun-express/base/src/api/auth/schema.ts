// schema.ts belongs: the auth module's zod request and response schemas and their OpenAPI
// registration. It is the leaf of the module. It does not belong: business rules (they live in
// controller.ts, auth owns no data), anything that touches Express, or token handling.
// The shared shapes live in models/; each schema is checked against its type with `satisfies`.
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import { OtpPurpose } from '../../models/auth/enum'
import type {
  AuthSession as AuthSessionType,
  AuthTokens as AuthTokensType,
  OtpVerified as OtpVerifiedType,
} from '../../models/auth/type'
import { USER_LIMITS } from '../../models/user/constants'
import type { ContactTarget } from '../../models/user/type'
import { errorResponses, jsonBody, jsonResponse } from '../../services/utils/openapi'
import { z } from '../../services/utils/zod'
import { PublicUser } from '../user/schema'

// Trimmed and lower-cased before the format check, so "  Ada@Example.com " is one account.
const Email = z.string().trim().toLowerCase().max(USER_LIMITS.email.max).pipe(z.email())

// HTTP-only: the input of register and login.
export const Credentials = z
  .object({
    email: Email,
    password: z.string().min(USER_LIMITS.password.min).max(USER_LIMITS.password.max),
  })
  .openapi('Credentials')
export type Credentials = z.infer<typeof Credentials>

// The route reads the transport (cookie first); the body is the fallback for a server-side client.
export const RefreshBody = z
  .object({ refreshToken: z.string().optional() })
  .optional()
  .transform((body) => body ?? {})
  .openapi('RefreshBody')
export type RefreshBody = z.infer<typeof RefreshBody>

export const LogoutBody = z
  .object({ all: z.boolean().default(false) })
  .default({ all: false })
  .openapi('LogoutBody')
export type LogoutBody = z.infer<typeof LogoutBody>

export const Target = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email'), value: Email }),
  z.object({ type: z.literal('phone'), value: z.string().regex(USER_LIMITS.phone.pattern) }),
]) satisfies z.ZodType<ContactTarget>

export const OtpRequestBody = z
  .object({ target: Target, purpose: z.enum(OtpPurpose) })
  .openapi('OtpRequestBody')
export type OtpRequestBody = z.infer<typeof OtpRequestBody>

export const OtpVerificationBody = z
  .object({ target: Target, purpose: z.enum(OtpPurpose), code: z.string().regex(/^\d{6}$/) })
  .openapi('OtpVerificationBody')
export type OtpVerificationBody = z.infer<typeof OtpVerificationBody>

export const AuthTokens = z
  .object({
    accessToken: z.string(),
    accessExpiresAt: z.iso.datetime(),
    refreshToken: z.string(),
    refreshExpiresAt: z.iso.datetime(),
  })
  .openapi('AuthTokens') satisfies z.ZodType<AuthTokensType>

export const AuthSession = z
  .object({ user: PublicUser, tokens: AuthTokens })
  .openapi('AuthSession') satisfies z.ZodType<AuthSessionType>

// Tokens only on the login purpose: verifying a contact does not start a session.
export const OtpVerified = z
  .object({ user: PublicUser, tokens: AuthTokens.optional() })
  .openapi('OtpVerified') satisfies z.ZodType<OtpVerifiedType>

export const Accepted = z.object({}).openapi('Accepted')

export function registerAuth(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: 'post',
    path: '/api/auth/register',
    tags: ['auth'],
    summary: 'Create an account and start a session',
    request: { body: jsonBody(Credentials) },
    responses: {
      201: jsonResponse('The new user and its tokens (also set as cookies)', AuthSession),
      ...errorResponses(400, 409, 429, 500),
    },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/auth/login',
    tags: ['auth'],
    summary: 'Sign in with email and password',
    request: { body: jsonBody(Credentials) },
    responses: {
      200: jsonResponse('The user and its tokens (also set as cookies)', AuthSession),
      ...errorResponses(400, 401, 403, 429, 500),
    },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/auth/refresh',
    tags: ['auth'],
    summary: 'Rotate the refresh token (cookie or body) and issue new tokens',
    request: { body: jsonBody(RefreshBody) },
    responses: {
      200: jsonResponse('The user and its rotated tokens (also set as cookies)', AuthSession),
      ...errorResponses(400, 401, 403, 429, 500),
    },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/auth/logout',
    tags: ['auth'],
    summary: 'Revoke the current session, or every session with all: true',
    request: { body: jsonBody(LogoutBody) },
    responses: {
      204: { description: 'Signed out; the auth cookies are cleared' },
      ...errorResponses(401, 500),
    },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/auth/otp',
    tags: ['auth'],
    summary: 'Send a one-time code (always 202 for login, whether or not the target exists)',
    request: { body: jsonBody(OtpRequestBody) },
    responses: {
      202: jsonResponse('Accepted', Accepted),
      ...errorResponses(400, 401, 403, 429, 500, 503),
    },
  })
  registry.registerPath({
    method: 'post',
    path: '/api/auth/otp/verification',
    tags: ['auth'],
    summary: 'Verify a one-time code: login starts a session, verify marks the contact verified',
    request: { body: jsonBody(OtpVerificationBody) },
    responses: {
      200: jsonResponse('The user, and tokens on the login purpose', OtpVerified),
      ...errorResponses(400, 401, 403, 429, 500),
    },
  })
}
