// controller.ts belongs: this directory's public API, one typed function per operation with no
// `req`, no `res` and no status code. It calls its own service and, to cross into another
// api/ directory, that directory's controller; other api/ directories import this file and
// nothing else of this one.
// It does not belong: HTTP (route.ts), business rules (service.ts) or data access.
import type { Caller } from '../../models/auth/type' // @auth
import type { CreateModuleInput, PublicModule, UpdateModuleInput } from '../../models/module/type'
import type { Page, PageQuery } from '../../services/utils/pagination'
import * as service from './service'

export function listModule({ query }: { query: PageQuery }): Promise<Page<PublicModule>> {
  return service.listModule(query)
}

export function getModule(id: string): Promise<PublicModule> {
  return service.getModule(id)
}

export function createModule({
  input,
  caller, // @auth
}: {
  input: CreateModuleInput
  caller: Caller // @auth
}): Promise<PublicModule> {
  return service.createModule(input, caller) // @auth
  return service.createModule(input) // @noauth
}

export function updateModule({
  id,
  input,
  caller, // @auth
}: {
  id: string
  input: UpdateModuleInput
  caller: Caller // @auth
}): Promise<PublicModule> {
  return service.updateModule(id, input, caller) // @auth
  return service.updateModule(id, input) // @noauth
}

export function deleteModule({ id, caller }: { id: string; caller: Caller }): Promise<void> { // @auth
export function deleteModule({ id }: { id: string }): Promise<void> { // @noauth
  return service.deleteModule(id, caller) // @auth
  return service.deleteModule(id) // @noauth
}
