// type.ts belongs: the public user shape (ISO-string timestamps, `T | null` for absent
// values), the create and update inputs, and the contact target other layers share.
// It does not belong: the stored record (interface.ts), value sets (enum.ts) or limits
// (constants.ts).
import type { ContactType, UserRole, UserStatus } from './enum'

export type PublicUser = {
  id: string
  email: string
  phone: string | null
  role: UserRole
  status: UserStatus
  emailVerifiedAt: string | null
  phoneVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateUserInput = {
  email: string
  password: string
}

// zod's `.optional()` admits an explicit `undefined` and the project compiles with
// `exactOptionalPropertyTypes`, so the input type says so. Absent means "leave unchanged",
// `null` means "clear".
export type UpdateUserInput = {
  phone?: string | null | undefined
}

// The normalised address an OTP goes to: email lower-cased, phone in E.164.
export type ContactTarget = {
  type: ContactType
  value: string
}
