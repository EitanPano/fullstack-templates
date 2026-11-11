import type { PublicUser } from '@/services/generated/types.gen'

// The account as the contract describes it; the model adds what the UI derives from it.
export type User = PublicUser
export type Role = User['role']
