import { readSession } from '@/shared/auth/session'

import type { User } from '../model'

// The signed-in account, or null. A per-user read: dynamic by nature (it reads cookies), so it
// is never cached and a widget that calls it sits inside Suspense.
export async function getCurrentUser(): Promise<User | null> {
  const session = await readSession()
  return session?.user ?? null
}
