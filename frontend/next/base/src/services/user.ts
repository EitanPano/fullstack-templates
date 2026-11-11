import 'server-only'

import { readSession } from '@/core/auth/session'

import type { User } from '@/models/user'

// The signed-in account, or null. A per-user read: dynamic by nature (it reads cookies), so it
// is never cached and a component that calls it sits inside Suspense.
export async function getCurrentUser(): Promise<User | null> {
  const session = await readSession()
  return session?.user ?? null
}
