import { computed } from '@angular/core'
import { signalStoreFeature, withComputed, withState } from '@ngrx/signals'

import type { ApiError } from '@app/models/api/response'

export type RequestStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface RequestStatusState {
  status: RequestStatus
  error: ApiError | null
}

// State updaters: `patchState(store, setLoading())`, `patchState(store, { rows }, setLoaded())`.
export const setLoading = (): RequestStatusState => ({ status: 'loading', error: null })
export const setLoaded = (): RequestStatusState => ({ status: 'loaded', error: null })
export const setError = (error: ApiError): RequestStatusState => ({ status: 'error', error })

// The status of a store's one request, and the flags a page reads. Add it to a store with
// `withRequestStatus()`; a store with two independent requests keeps a status of its own per
// request instead.
export function withRequestStatus() {
  return signalStoreFeature(
    withState<RequestStatusState>({ status: 'idle', error: null }),
    withComputed(({ status }) => ({
      loading: computed(() => status() === 'loading'),
      loaded: computed(() => status() === 'loaded'),
      failed: computed(() => status() === 'error'),
    })),
  )
}
