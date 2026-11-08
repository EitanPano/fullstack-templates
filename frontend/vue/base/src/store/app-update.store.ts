import { defineStore } from 'pinia'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { watch } from 'vue'

import { logger } from '@/core/providers/logger'

import { useNotificationStore } from './notification.store'

// Keeps the installed app current. The worker downloads a new version in the background and
// waits (registerType 'prompt'); `needRefresh` flips when one is ready. This tells the user and,
// on their say, activates it and reloads: never automatically, so no one loses work mid-form.
// `check` asks the browser for a newer worker; pwa.initializer.ts calls it on a schedule.
export const useAppUpdateStore = defineStore('app-update', () => {
  const notifications = useNotificationStore()
  let registration: ServiceWorkerRegistration | undefined

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registered) {
      registration = registered
    },
    onRegisterError(error) {
      logger.error('Service worker registration failed', error)
    },
  })

  // Activates the waiting worker; the plugin reloads the page once it controls it.
  async function activate(): Promise<void> {
    try {
      await updateServiceWorker(true)
    } catch (error) {
      logger.error('Activating the new version failed', error)
    }
  }

  function check(): void {
    registration?.update().catch((error: unknown) => {
      logger.error('Checking for an update failed', error)
    })
  }

  watch(needRefresh, (ready) => {
    if (!ready) return
    notifications.showInfo('pwa.updateReady', undefined, {
      labelKey: 'pwa.reload',
      run: () => {
        void activate()
      },
    })
  })

  return { needRefresh, activate, check }
})
