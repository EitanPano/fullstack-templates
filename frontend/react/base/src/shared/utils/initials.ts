// Two letters for an avatar: the start of the part of the email before the @.
export function initials(user: { email: string }): string | undefined {
  const name = user.email.split('@')[0] ?? ''
  const letters = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2)
  return letters === '' ? undefined : letters.toUpperCase()
}
