// interface.ts belongs: the stored user record, what the user repository reads and writes.
// Timestamps are `Date`; optional fields are `field?: T`. It does not belong: the public
// shape or inputs (type.ts) or value sets (enum.ts). A `type` alias despite the name.
import type { UserRole, UserStatus } from './enum'

export type UserRecord = {
  id: string
  email: string
  phone?: string
  passwordHash?: string
  role: UserRole
  status: UserStatus
  emailVerifiedAt?: Date
  phoneVerifiedAt?: Date
  createdAt: Date
  updatedAt: Date
}
