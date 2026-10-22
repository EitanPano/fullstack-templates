// controller.ts belongs: the user module's public API. One typed function per operation, no
// `req`, no `res`, no status code; it forwards to service.ts. Other modules import this file
// to cross the module boundary. It does not belong: HTTP, data access or business rules.
import type { Caller } from '../../models/auth/type'
import type { ContactType, UserRole } from '../../models/user/enum'
import type {
  ContactTarget,
  CreateUserInput,
  PublicUser,
  UpdateUserInput,
} from '../../models/user/type'
import type { Page, PageQuery } from '../../services/utils/pagination'
import * as service from './service'

export function getMe({ caller }: { caller: Caller }): Promise<PublicUser> {
  return service.getMe(caller)
}

export function updateMe({
  caller,
  input,
}: {
  caller: Caller
  input: UpdateUserInput
}): Promise<PublicUser> {
  return service.updateMe(caller, input)
}

export function listUser({
  query,
  caller,
}: {
  query: PageQuery
  caller: Caller
}): Promise<Page<PublicUser>> {
  return service.listUser(query, caller)
}

export function getUser({ id, caller }: { id: string; caller: Caller }): Promise<PublicUser> {
  return service.getUser(id, caller)
}

// The operations below take no caller: they are system operations for other modules (auth),
// jobs and scripts. No route exposes them, so whoever calls them has already decided it may.

export function createUser({ input }: { input: CreateUserInput }): Promise<PublicUser> {
  return service.createUser(input)
}

export function verifyCredentials({
  input,
}: {
  input: { email: string; password: string }
}): Promise<PublicUser> {
  return service.verifyCredentials(input)
}

export function findUserByTarget({
  target,
}: {
  target: ContactTarget
}): Promise<PublicUser | null> {
  return service.findUserByTarget(target)
}

export function getActiveUser(id: string): Promise<PublicUser> {
  return service.getActiveUser(id)
}

export function markVerified({ id, type }: { id: string; type: ContactType }): Promise<PublicUser> {
  return service.markVerified(id, type)
}

export function setUserRole({ id, role }: { id: string; role: UserRole }): Promise<PublicUser> {
  return service.setUserRole(id, role)
}
