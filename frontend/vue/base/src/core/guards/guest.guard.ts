import type { NavigationGuard } from 'vue-router'

import { useAuthStore } from '@/store/auth.store'

// The sign-in and register screens (`beforeEnter: guestGuard`): an account that is already
// signed in goes home. It waits for the session restore, so a returning account never sees the
// form flash.
export const guestGuard: NavigationGuard = async () => {
  const auth = useAuthStore()
  await auth.ready
  return auth.isLoggedIn ? '/' : true
}
