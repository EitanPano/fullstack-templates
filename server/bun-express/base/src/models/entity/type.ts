// type.ts belongs: the public shape (timestamps as ISO strings, `T | null` where the contract
// says a value may be absent), the create and update inputs, and derived types that several
// layers share.
// It does not belong: the stored record (interface.ts), value sets (enum.ts) or limits
// (constants.ts).
import type { EntityStatus } from './enum'

export type PublicEntity = {
  id: string
  name: string
  status: EntityStatus
  createdAt: string
  updatedAt: string
}

export type CreateEntityInput = {
  name: string
}

// zod's `.optional()` admits an explicit `undefined` and the project compiles with
// `exactOptionalPropertyTypes`, so both fields say so; absent means "leave unchanged".
export type UpdateEntityInput = {
  name?: string | undefined
  status?: EntityStatus | undefined
}
