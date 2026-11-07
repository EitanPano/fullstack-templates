import type { PublicUser } from '@/services/generated/types.gen'

// The account as the contract describes it; the model adds what the UI derives from it.
export type User = PublicUser
export type Role = User['role']

// Renaming a role edits this list, every `requireRole` call, the tests and the agents file, after
// the server and `contract`.
const ROLES: readonly string[] = ['user', 'admin'] satisfies Role[]

// A body that names an account. The guards trust the API's answer, not the page, so a response
// that is not shaped like one reads as a visitor.
export function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'email' in value &&
    typeof value.email === 'string' &&
    'role' in value &&
    typeof value.role === 'string' &&
    ROLES.includes(value.role)
  )
}

// Two letters for an avatar: the start of the part of the email before the @.
export function initials(user: Pick<User, 'email'>): string | undefined {
  const name = user.email.split('@')[0] ?? ''
  const letters = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2)
  return letters === '' ? undefined : letters.toUpperCase()
}
