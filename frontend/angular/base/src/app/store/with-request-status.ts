import { inject } from '@angular/core'
import { patchState, signalStoreFeature, withMethods, withProps, withState } from '@ngrx/signals'

import { errorMessageKey } from '@app/core/config/error-copy'
import { LoggerService } from '@app/core/providers/logger.service'
import { NetworkService } from '@app/core/providers/network.service'
import { NotificationService } from '@app/core/providers/notification.service'
import { DROPPED } from '@app/models/api/constant'
import type { ApiErrorCode, Outcome } from '@app/models/api/type'
import { ApiError, isApiError } from '@app/services/api-error'

export type RequestStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface CallState {
  readonly status: RequestStatus
  readonly error: ApiError | null
}

export interface CallOptions<T> {
  // A write: while the browser reports no connection it is not sent and `errors.offline` toasts.
  readonly mutation?: boolean
  // Behind a form: `validation_failed` is not toasted; the page puts it on its fields.
  readonly form?: boolean
  // No toast at all (a start-up probe nobody asked for).
  readonly silent?: boolean
  // A better copy key for a code in this call (a 401 from login means wrong credentials).
  readonly overrides?: Partial<Record<ApiErrorCode, string>>
  // Applies the answer to the store; never runs for a replaced call.
  readonly onSuccess?: (value: T) => void
}

const IDLE: CallState = { status: 'idle', error: null }
const LOADING: CallState = { status: 'loading', error: null }
const LOADED: CallState = { status: 'loaded', error: null }

// A status per named call, and the one way a store method calls the API:
// `store._call('load', () => service.list(), { onSuccess: (page) => patchState(store, { page }) })`.
// It resolves to an `Outcome` and never rejects. A failure is recorded on its call, logged when it
// is not an `ApiError`, and toasted once through the copy table. The latest call of a name wins: an
// answer that arrives after a newer call of that name, or after `_resetCalls`, is dropped unseen.
export function withRequestStatus<const Name extends string>(config: {
  readonly store: string
  readonly calls: readonly Name[]
}) {
  const initial = Object.fromEntries(config.calls.map((name) => [name, IDLE])) as Record<
    Name,
    CallState
  >

  return signalStoreFeature(
    withState({ calls: initial }),
    withProps((store) => {
      const network = inject(NetworkService)
      const notifications = inject(NotificationService)
      const logger = inject(LoggerService)
      const generations = new Map<Name, number>()

      const set = (name: Name, next: CallState): void => {
        patchState(store, (state) => ({ calls: { ...state.calls, [name]: next } }))
      }
      const isCurrent = (name: Name, generation: number): boolean =>
        generations.get(name) === generation

      const fail = <T>(name: Name, cause: unknown, options: CallOptions<T>): ApiError => {
        if (!isApiError(cause)) logger.error(`${config.store}.${name} failed`, cause)
        const error = isApiError(cause) ? cause : new ApiError({ status: 0, code: 'unknown' })
        set(name, { status: 'error', error })
        const quiet =
          options.silent === true || (options.form === true && error.code === 'validation_failed')
        if (!quiet) {
          notifications.showError(options.overrides?.[error.code] ?? errorMessageKey(error.code))
        }
        return error
      }

      async function call<T>(
        name: Name,
        request: () => Promise<T>,
        options: CallOptions<T> = {},
      ): Promise<Outcome<T>> {
        if (options.mutation === true && !network.online()) {
          notifications.showError('errors.offline')
          return DROPPED
        }
        const generation = (generations.get(name) ?? 0) + 1
        generations.set(name, generation)
        set(name, LOADING)
        try {
          const value = await request()
          if (!isCurrent(name, generation)) return DROPPED
          options.onSuccess?.(value)
          set(name, LOADED)
          return { ok: true, value }
        } catch (cause) {
          if (!isCurrent(name, generation)) return DROPPED
          return { ok: false, error: fail(name, cause, options) }
        }
      }

      // Forgets the named calls (every call with no name) and drops any answer still in flight.
      function resetCalls(...names: Name[]): void {
        for (const name of names.length > 0 ? names : config.calls) {
          generations.set(name, (generations.get(name) ?? 0) + 1)
          set(name, IDLE)
        }
      }

      return { _call: call, _resetCalls: resetCalls }
    }),
    withMethods(({ calls }) => ({
      loading: (name: Name): boolean => calls()[name].status === 'loading',
      loaded: (name: Name): boolean => calls()[name].status === 'loaded',
      failed: (name: Name): boolean => calls()[name].status === 'error',
      error: (name: Name): ApiError | null => calls()[name].error,
    })),
  )
}
