// type.ts belongs: the public shape (timestamps as ISO strings, `T | null` where the contract
// says a value may be absent), the create and update inputs, and derived types that several
// layers share.
// It does not belong: the stored record (interface.ts), value sets (enum.ts) or limits
// (constants.ts).
import type { ModuleStatus } from './enum'

export type PublicModule = {
  id: string
  name: string
  status: ModuleStatus
  createdAt: string
  updatedAt: string
}

export type CreateModuleInput = {
  name: string
}

// zod's `.optional()` admits an explicit `undefined` and the project compiles with
// `exactOptionalPropertyTypes`, so both fields say so; absent means "leave unchanged".
export type UpdateModuleInput = {
  name?: string | undefined
  status?: ModuleStatus | undefined
}
