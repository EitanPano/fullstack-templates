import type { Router } from 'vue-router'

import { LOGIN_PATH } from '@/core/config/constants'
import { toLogin } from '@/core/guards/auth.guard'
import { onSessionLost } from '@/core/providers/session'
import { useAuthStore } from '@/store/auth.store'

// Starts the session restore at boot and wires the reaction to a lost session. It never waits: the
// app mounts at once, public pages render, and the guards await `authStore.ready` (settled by the
// restore, or by its 5 s cap) before they decide. With no session hint the restore returns at
// once and `ready` is already settled.
//
// The fetch wrapper emits `sessionLost` when the API refuses the refresh cookie (it has cleared the
// hint). The store forgets the account; an account that was signed in goes to sign-in with the
// page it was on, unless the start-up read is running (the guards decide then), or it is already
// on a login URL. A visitor on a public page stays where they are. Returns the unsubscribe.
export function initSession(router: Router): () => void {
  const auth = useAuthStore()
  const off = onSessionLost(() => {
    const wasSignedIn = auth.isLoggedIn
    const restoring = auth.restoring
    auth.forget()
    if (!wasSignedIn || restoring) return
    const current = router.currentRoute.value
    if (current.path.startsWith(LOGIN_PATH)) return
    void router.push(toLogin(current))
  })
  void auth.restoreSession()
  return off
}
