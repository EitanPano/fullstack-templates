import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

import { STORAGE_KEYS } from '@/core/config/constants'
import { logger } from '@/core/providers/logger'
import { storage } from '@/core/providers/storage'

// The non-standard event Chromium fires when the app can be installed.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// iOS Safari only: other iOS browsers cannot add to the home screen the same way.
function isIosSafari(): boolean {
  const { userAgent, maxTouchPoints } = navigator
  const ios =
    /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)
  return ios && !/crios|fxios|edgios/i.test(userAgent)
}

function isStandalone(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
  return window.matchMedia('(display-mode: standalone)').matches
}

// The install prompt. Chromium offers it once through `beforeinstallprompt`; the store keeps the
// event so the header can show an install button and open the prompt on a click. iOS Safari has no
// such event (the user installs through the share sheet), so `showIosHint` says when to explain it,
// until the user dismisses it (remembered in local storage). Start it early (pwa.initializer.ts):
// the event can fire before any component is mounted.
export const useInstallPromptStore = defineStore('install-prompt', () => {
  const offer = ref<BeforeInstallPromptEvent | null>(null)
  const iosHintDismissed = ref(storage.get(STORAGE_KEYS.iosHint) === true)
  const iosHintEligible = isIosSafari() && !isStandalone()

  const canInstall = computed(() => offer.value !== null)
  const showIosHint = computed(() => iosHintEligible && !iosHintDismissed.value)

  const onPrompt = (event: Event) => {
    event.preventDefault()
    offer.value = event as BeforeInstallPromptEvent
  }
  const onInstalled = () => {
    offer.value = null
  }
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  onScopeDispose(() => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  })

  // Opens the browser's install prompt and waits for the answer. The event works once, so it is
  // cleared whatever the user chose.
  async function promptInstall(): Promise<boolean> {
    const event = offer.value
    if (!event) return false
    // Cleared before the prompt opens, and kept cleared if it fails: the event works once, so a
    // second prompt() on it would only throw again.
    offer.value = null
    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      return outcome === 'accepted'
    } catch (error) {
      logger.error('Opening the install prompt failed', error)
      return false
    }
  }

  function dismissIosHint(): void {
    iosHintDismissed.value = true
    storage.set(STORAGE_KEYS.iosHint, true)
  }

  return { canInstall, showIosHint, promptInstall, dismissIosHint }
})
