import { useAppUpdateStore } from '@/store/app-update.store'
import { useInstallPromptStore } from '@/store/install-prompt.store'
import { useNotificationStore } from '@/store/notification.store'

const HOUR_MS = 60 * 60 * 1000
const FOCUS_THROTTLE_MS = 5 * 60 * 1000

// Starts the worker registration and the install listener before the first render, so an early
// `beforeinstallprompt` is not missed. Updates are checked every hour and when the window
// regains focus (at most every five minutes). Needs the active Pinia.
export function initPwa(): void {
  const updates = useAppUpdateStore()
  const install = useInstallPromptStore()

  setInterval(updates.check, HOUR_MS)
  let lastFocusCheck = -Infinity
  window.addEventListener('focus', () => {
    const now = Date.now()
    if (now - lastFocusCheck < FOCUS_THROTTLE_MS) return
    lastFocusCheck = now
    updates.check()
  })

  if (install.showIosHint) {
    useNotificationStore().showInfo('pwa.iosHint', undefined, {
      labelKey: 'actions.dismiss',
      run: install.dismissIosHint,
    })
  }
}
