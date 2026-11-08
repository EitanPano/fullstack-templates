import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useNotificationStore } from './notification.store'

describe('notification store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('queues a toast with the kind, key and params it was given', () => {
    const store = useNotificationStore()

    const id = store.showError('errors.network', { n: 2 })

    expect(store.toasts).toEqual([
      { id, kind: 'error', messageKey: 'errors.network', params: { n: 2 }, timeoutMs: 8000 },
    ])
  })

  it('gives each kind its own time on screen', () => {
    const store = useNotificationStore()

    store.showSuccess('a')
    store.showInfo('b')
    store.showWarning('c')
    store.showError('d')

    expect(store.toasts.map((toast) => toast.timeoutMs)).toEqual([4000, 5000, 6000, 8000])
  })

  it('keeps a toast with an action open until the user answers (timeoutMs 0)', () => {
    const store = useNotificationStore()
    const run = vi.fn()

    store.showInfo('pwa.updateReady', undefined, { labelKey: 'actions.retry', run })

    expect(store.toasts[0]?.timeoutMs).toBe(0)
    expect(store.toasts[0]?.action?.labelKey).toBe('actions.retry')
  })

  it('numbers toasts uniquely and dismisses one by id', () => {
    const store = useNotificationStore()
    const first = store.showInfo('a')
    const second = store.showInfo('b')

    store.dismiss(first)

    expect(second).not.toBe(first)
    expect(store.toasts.map((toast) => toast.id)).toEqual([second])
  })

  it('ignores a dismiss of an id that is gone', () => {
    const store = useNotificationStore()
    store.showInfo('a')

    store.dismiss(999)

    expect(store.toasts).toHaveLength(1)
  })
})
