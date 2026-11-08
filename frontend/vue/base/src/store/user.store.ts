import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { errorMessageKey } from '@/models/api/error-copy'
import type { PublicUser, UpdateMeBody } from '@/models/user/interface'
import { userService } from '@/services/user.service'

import { useAuthStore } from './auth.store'
import { useNetworkStore } from './network.store'
import { useNotificationStore } from './notification.store'
import { useRequestStatus } from './request-status'

// The account's profile as the profile page reads and edits it. `useAuthStore` answers who is
// signed in; this store holds the profile data, so a save here never touches the session. It holds
// an account's data, so it clears itself whenever nobody is signed in (sign-out, a refused
// refresh): the next account must never see, or save, this one's profile.
export const useUserStore = defineStore('user', () => {
  const request = useRequestStatus()
  const auth = useAuthStore()
  const network = useNetworkStore()
  const notifications = useNotificationStore()
  const profile = ref<PublicUser | null>(null)

  // Forgets the profile and the request outcome.
  function reset(): void {
    profile.value = null
    request.status.value = 'idle'
    request.error.value = null
  }

  // Synchronous, so there is no moment where a signed-out page can still read the profile.
  watch(
    () => auth.isLoggedIn,
    (signedIn) => {
      if (!signedIn) reset()
    },
    { flush: 'sync' },
  )

  function fail(cause: unknown, context: string): void {
    const apiError = request.fail(cause, `user.${context}`)
    if (apiError.code !== 'validation_failed')
      notifications.showError(errorMessageKey(apiError.code))
  }

  async function load(): Promise<void> {
    // A profile of another account must not show while this one loads.
    profile.value = null
    request.setLoading()
    try {
      const loaded = await userService.me()
      // Signed out while the call was in flight: the answer belongs to nobody now.
      if (!auth.isLoggedIn) return
      profile.value = loaded
      request.setLoaded()
    } catch (cause) {
      fail(cause, 'load')
    }
  }

  // true once the server accepted the change. A validation failure stays in `error` for the page
  // to put on its fields.
  async function update(body: UpdateMeBody): Promise<boolean> {
    if (!network.online) {
      notifications.showError('errors.offline')
      return false
    }
    request.setLoading()
    try {
      const saved = await userService.update(body)
      if (auth.isLoggedIn) {
        profile.value = saved
        request.setLoaded()
      }
      return true
    } catch (cause) {
      fail(cause, 'update')
      return false
    }
  }

  return { ...request, profile, reset, load, update }
})
