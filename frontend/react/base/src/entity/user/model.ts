import type { PublicUser } from '@/shared/api'

// The account as the contract describes it; the model adds what the UI derives from it.
export type User = PublicUser

// Two letters for an avatar: the start of the part of the email before the @.
export function initials(user: Pick<User, 'email'>): string | undefined {
  const name = user.email.split('@')[0] ?? ''
  const letters = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2)
  return letters === '' ? undefined : letters.toUpperCase()
}
