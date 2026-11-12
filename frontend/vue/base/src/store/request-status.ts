import { computed, ref } from 'vue'

import { logger } from '@/core/providers/logger'
import type { ApiError } from '@/models/api/type'
import { isApiError, toApiError } from '@/services/api-error'

export type RequestStatus = 'idle' | 'loading' | 'loaded' | 'error'

// The status of one request and the flags a page reads. A store spreads it into its return:
// `return { ...useRequestStatus(), rows }`. A store with two independent requests calls it twice
// and renames the pair it keeps.
export function useRequestStatus() {
  const status = ref<RequestStatus>('idle')
  const error = ref<ApiError | null>(null)

  const loading = computed(() => status.value === 'loading')
  const loaded = computed(() => status.value === 'loaded')
  const failed = computed(() => status.value === 'error')

  function setLoading(): void {
    status.value = 'loading'
    error.value = null
  }

  function setLoaded(): void {
    status.value = 'loaded'
    error.value = null
  }

  function setError(cause: ApiError): void {
    status.value = 'error'
    error.value = cause
  }

  // The catch of a store method: logs a cause that is no ApiError (a bug, never silent), keeps the
  // ApiError in state and returns it for the toast.
  function fail(cause: unknown, context?: string): ApiError {
    if (!isApiError(cause)) logger.error(context ?? 'request failed', cause)
    const apiError = toApiError(cause, context)
    setError(apiError)
    return apiError
  }

  return { status, error, loading, loaded, failed, setLoading, setLoaded, setError, fail }
}
