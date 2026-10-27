import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { getCurrentUser } from '@/entity/user/server/user'

// Renders its children for a visitor and sends a signed-in account home. The (auth) layout wraps
// the sign-in and sign-up screens in it, inside Suspense.
export async function GuestOnly({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) redirect('/')
  return children
}
