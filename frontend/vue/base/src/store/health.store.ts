import { defineStore } from 'pinia'
import { ref } from 'vue'

import { errorMessageKey } from '@/models/api/error-copy'
import type { HealthResponse } from '@/models/health/interface'
import { healthService } from '@/services/health.service'

import { useNotificationStore } from './notification.store'
import { useRequestStatus } from './request-status'

// The server's liveness, as the home page reads it. `load()` is the recipe of a store method: set
// the status, await the facade, patch the refs; on failure `fail` keeps the ApiError and the store
// toasts its copy key once (`errors.<code>`).
export const useHealthStore = defineStore('health', () => {
  const request = useRequestStatus()
  const notifications = useNotificationStore()
  const health = ref<HealthResponse | null>(null)
  const checkedAt = ref<string | null>(null)

  async function load(): Promise<void> {
    request.setLoading()
    try {
      health.value = await healthService.get()
      checkedAt.value = new Date().toISOString()
      request.setLoaded()
    } catch (cause) {
      notifications.showError(errorMessageKey(request.fail(cause, 'health.load').code))
    }
  }

  return { ...request, health, checkedAt, load }
})
