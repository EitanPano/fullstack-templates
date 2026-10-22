// controller.ts belongs: the user module's business logic, its public API and its HTTP
// handlers. Each handler, named after its operation (`updateMe`), reads the input validate()
// parsed, resolves the caller, applies the rules, reads and writes through service.ts and sends
// the status and body. Logic other modules (auth), jobs and scripts need is exported as a typed
// rule with no `req` and no `res`: they cross into the user module through those rules and
// nothing else. Rules throw AppError, map stored records to the public shape and publish events.
// It does not belong: middleware (routes.ts), queries (service.ts), credential verification or
// token handling (auth). Every rule returns the public shape; findUserByEmail alone also hands
// auth the stored hash, beside it.
import { randomUUID } from 'node:crypto'

import type { Request, Response } from 'express'

import { requireCaller } from '../../middleware/auth'
import { readInput } from '../../middleware/validate'
import type { Caller } from '../../models/auth/type'
import type { ContactType, UserRole } from '../../models/user/enum'
import type { UserRecord } from '../../models/user/interface'
import type {
  ContactTarget,
  CreateUserInput,
  PublicUser,
  UserCredentials,
} from '../../models/user/type'
import { publish } from '../../services/event'
import { hashPassword } from '../../services/security/crypto'
import { AppError } from '../../services/utils/error'
import { getUserRequest, listUserRequest, updateMeRequest } from './schema'
import * as service from './service'

function toPublic(record: UserRecord): PublicUser {
  return {
    id: record.id,
    email: record.email,
    phone: record.phone ?? null,
    role: record.role,
    status: record.status,
    emailVerifiedAt: record.emailVerifiedAt?.toISOString() ?? null,
    phoneVerifiedAt: record.phoneVerifiedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

// routes.ts already gates list and get with requireRole; the handlers check the caller too, so
// an endpoint mounted without its gate fails closed.
function assertRole(caller: Caller, role: UserRole): void {
  if (caller.role !== role) throw new AppError('forbidden', 'insufficient role')
}

const normaliseEmail = (email: string) => email.trim().toLowerCase()

async function requireRecord(id: string): Promise<UserRecord> {
  const record = await service.findById(id)
  if (record === undefined) throw new AppError('not_found', 'user not found')
  return record
}

// A caller whose account was deleted after the token was minted is no longer authenticated;
// that is a 401, not a missing resource.
async function requireCallerRecord(caller: Caller): Promise<UserRecord> {
  const record = await service.findById(caller.id)
  if (record === undefined) throw new AppError('unauthenticated', 'authentication required')
  return record
}

// The caller's own account: auth checks an OTP target against it, and `GET /me` sends it.
export async function getCallerUser(caller: Caller): Promise<PublicUser> {
  return toPublic(await requireCallerRecord(caller))
}

// The operations below take no caller: they are system operations for other modules (auth),
// jobs and scripts. No route exposes them, so whoever calls them has already decided it may.

// Sends nothing itself: a subscriber to `user.registered` sends the welcome message.
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const email = normaliseEmail(input.email)
  if ((await service.findByEmail(email)) !== undefined) {
    throw new AppError('conflict', 'email already registered')
  }
  const now = new Date()
  const record = await service.insert({
    id: randomUUID(),
    email,
    passwordHash: await hashPassword(input.password),
    role: 'user',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
  await publish('user.registered', { userId: record.id })
  return toPublic(record)
}

// Auth's lookup for a password login: the user and, beside it, the stored hash auth verifies.
// No status check: auth decides what a blocked account learns, and when.
export async function findUserByEmail(email: string): Promise<UserCredentials | null> {
  const record = await service.findByEmail(normaliseEmail(email))
  if (record === undefined) return null
  return { user: toPublic(record), passwordHash: record.passwordHash }
}

export async function findUserByTarget(target: ContactTarget): Promise<PublicUser | null> {
  const record =
    target.type === 'email'
      ? await service.findByEmail(normaliseEmail(target.value))
      : await service.findByVerifiedPhone(target.value)
  return record === undefined ? null : toPublic(record)
}

export async function getActiveUser(id: string): Promise<PublicUser> {
  const record = await requireRecord(id)
  if (record.status === 'blocked') throw new AppError('forbidden', 'account blocked')
  return toPublic(record)
}

// Idempotent: an already verified contact keeps its original timestamp.
export async function markVerified(id: string, type: ContactType): Promise<PublicUser> {
  const record = await requireRecord(id)
  const now = new Date()
  if (type === 'email') {
    if (record.emailVerifiedAt !== undefined) return toPublic(record)
    return toPublic(await service.update({ ...record, emailVerifiedAt: now, updatedAt: now }))
  }
  if (record.phoneVerifiedAt !== undefined) return toPublic(record)
  if (record.phone !== undefined) {
    const holder = await service.findByVerifiedPhone(record.phone)
    if (holder !== undefined && holder.id !== record.id) {
      throw new AppError('conflict', 'phone already in use')
    }
  }
  return toPublic(await service.update({ ...record, phoneVerifiedAt: now, updatedAt: now }))
}

export async function setUserRole(id: string, role: UserRole): Promise<PublicUser> {
  const record = await requireRecord(id)
  return toPublic(await service.update({ ...record, role, updatedAt: new Date() }))
}

// HTTP handlers: routes.ts mounts each one behind its middleware.

export async function getMe(_req: Request, res: Response): Promise<void> {
  res.json(await getCallerUser(requireCaller(res)))
}

export async function updateMe(_req: Request, res: Response): Promise<void> {
  const { body } = readInput(res, updateMeRequest)
  const record = await requireCallerRecord(requireCaller(res))
  const next: UserRecord = { ...record, updatedAt: new Date() }
  if (body.phone === null) {
    delete next.phone
    delete next.phoneVerifiedAt
  } else if (body.phone !== undefined && body.phone !== record.phone) {
    // Only a verified holder blocks the claim: an unverified claim must not lock the real owner
    // out of their own number.
    const owner = await service.findByVerifiedPhone(body.phone)
    if (owner !== undefined && owner.id !== record.id) {
      throw new AppError('conflict', 'phone already in use')
    }
    next.phone = body.phone
    delete next.phoneVerifiedAt
  }
  res.json(toPublic(await service.update(next)))
}

export async function listUser(_req: Request, res: Response): Promise<void> {
  const { query } = readInput(res, listUserRequest)
  assertRole(requireCaller(res), 'admin')
  const page = await service.list(query)
  res.json({ items: page.items.map(toPublic), nextCursor: page.nextCursor })
}

export async function getUser(_req: Request, res: Response): Promise<void> {
  const { params } = readInput(res, getUserRequest)
  assertRole(requireCaller(res), 'admin')
  res.json(toPublic(await requireRecord(params.id)))
}
