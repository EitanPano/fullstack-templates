// service.ts belongs: the user module's business rules; it is private to the module. It throws
// AppError and maps stored records to the public shape. It does not belong: HTTP concerns,
// queries (repository.ts) or token handling. A password hash never leaves this file.
import { randomUUID } from 'node:crypto'

import type { Caller } from '../../models/auth/type'
import type { ContactType, UserRole } from '../../models/user/enum'
import type { UserRecord } from '../../models/user/interface'
import type {
  ContactTarget,
  CreateUserInput,
  PublicUser,
  UpdateUserInput,
} from '../../models/user/type'
import { publish } from '../../services/event'
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../services/security/crypto'
import { AppError } from '../../services/utils/error'
import type { Page, PageQuery } from '../../services/utils/pagination'
import * as repository from './repository'

export function toPublic(record: UserRecord): PublicUser {
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

// The route gate is declarative; this is the check that holds when another module or a job
// calls the controller directly.
function assertRole(caller: Caller, role: UserRole): void {
  if (caller.role !== role) throw new AppError('forbidden', 'insufficient role')
}

const normaliseEmail = (email: string) => email.trim().toLowerCase()

async function requireRecord(id: string): Promise<UserRecord> {
  const record = await repository.findById(id)
  if (record === undefined) throw new AppError('not_found', 'user not found')
  return record
}

// A caller whose account was deleted after the token was minted is no longer authenticated;
// that is a 401, not a missing resource.
async function requireCallerRecord(caller: Caller): Promise<UserRecord> {
  const record = await repository.findById(caller.id)
  if (record === undefined) throw new AppError('unauthenticated', 'authentication required')
  return record
}

export async function getMe(caller: Caller): Promise<PublicUser> {
  return toPublic(await requireCallerRecord(caller))
}

export async function updateMe(caller: Caller, input: UpdateUserInput): Promise<PublicUser> {
  const record = await requireCallerRecord(caller)
  const next: UserRecord = { ...record, updatedAt: new Date() }
  if (input.phone === null) {
    delete next.phone
    delete next.phoneVerifiedAt
  } else if (input.phone !== undefined && input.phone !== record.phone) {
    // Only a verified holder blocks the claim: an unverified claim must not lock the real owner
    // out of their own number.
    const owner = await repository.findByVerifiedPhone(input.phone)
    if (owner !== undefined && owner.id !== record.id) {
      throw new AppError('conflict', 'phone already in use')
    }
    next.phone = input.phone
    delete next.phoneVerifiedAt
  }
  return toPublic(await repository.update(next))
}

export async function listUser(query: PageQuery, caller: Caller): Promise<Page<PublicUser>> {
  assertRole(caller, 'admin')
  const page = await repository.list(query)
  return { items: page.items.map(toPublic), nextCursor: page.nextCursor }
}

export async function getUser(id: string, caller: Caller): Promise<PublicUser> {
  assertRole(caller, 'admin')
  return toPublic(await requireRecord(id))
}

// Sends nothing itself: a subscriber to `user.registered` sends the welcome message.
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const email = normaliseEmail(input.email)
  if ((await repository.findByEmail(email)) !== undefined) {
    throw new AppError('conflict', 'email already registered')
  }
  const now = new Date()
  const record = await repository.insert({
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

// Every credential failure costs one password verification and gives one message, so neither
// timing nor text tells a caller whether the email exists. The blocked check comes after the
// password so a wrong password never learns that the account is blocked.
export async function verifyCredentials(input: {
  email: string
  password: string
}): Promise<PublicUser> {
  const record = await repository.findByEmail(normaliseEmail(input.email))
  const hash = record?.passwordHash
  if (record === undefined || hash === undefined) {
    await verifyPassword(input.password, DUMMY_HASH)
    throw new AppError('unauthenticated', 'invalid credentials')
  }
  if (!(await verifyPassword(input.password, hash))) {
    throw new AppError('unauthenticated', 'invalid credentials')
  }
  if (record.status === 'blocked') throw new AppError('forbidden', 'account blocked')
  return toPublic(record)
}

export async function findUserByTarget(target: ContactTarget): Promise<PublicUser | null> {
  const record =
    target.type === 'email'
      ? await repository.findByEmail(normaliseEmail(target.value))
      : await repository.findByVerifiedPhone(target.value)
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
    return toPublic(await repository.update({ ...record, emailVerifiedAt: now, updatedAt: now }))
  }
  if (record.phoneVerifiedAt !== undefined) return toPublic(record)
  if (record.phone !== undefined) {
    const holder = await repository.findByVerifiedPhone(record.phone)
    if (holder !== undefined && holder.id !== record.id) {
      throw new AppError('conflict', 'phone already in use')
    }
  }
  return toPublic(await repository.update({ ...record, phoneVerifiedAt: now, updatedAt: now }))
}

export async function setUserRole(id: string, role: UserRole): Promise<PublicUser> {
  const record = await requireRecord(id)
  return toPublic(await repository.update({ ...record, role, updatedAt: new Date() }))
}
