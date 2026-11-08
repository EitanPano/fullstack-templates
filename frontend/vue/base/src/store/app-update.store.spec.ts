import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useAppUpdateStore } from './app-update.store'
import { useNotificationStore } from './notification.store'

type Options = {
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}

// The service worker API is mocked: the plugin's virtual module hands the store a `needRefresh`
// ref and an `updateServiceWorker`, and calls back with the registration.
const sw = vi.hoisted(() => ({
  options: undefined as Options | undefined,
  update: undefined as ((reload?: boolean) => Promise<void>) | undefined,
}))
vi.mock('virtual:pwa-register/vue', async () => {
  const { ref } = await import('vue')
  return {
    useRegisterSW: (options: Options) => {
      sw.options = options
      return { needRefresh: ref(false), updateServiceWorker: sw.update }
    },
  }
})

function register(update: () => Promise<void>) {
  sw.options?.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration)
}

describe('useAppUpdateStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sw.update = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stays quiet until a new worker waits', async () => {
    useAppUpdateStore()
    await nextTick()

    expect(useNotificationStore().toasts).toEqual([])
  })

  it('offers one info toast when a new version is ready', async () => {
    const store = useAppUpdateStore()

    store.needRefresh = true
    await nextTick()

    const toasts = useNotificationStore().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      kind: 'info',
      messageKey: 'pwa.updateReady',
      action: { labelKey: 'pwa.reload' },
    })
    // Never a silent reload: the worker is activated only when the user answers the toast.
    expect(sw.update).not.toHaveBeenCalled()
  })

  it('activates the waiting worker and reloads when the toast action runs', async () => {
    const store = useAppUpdateStore()
    store.needRefresh = true
    await nextTick()

    useNotificationStore().toasts[0]?.action?.run()

    expect(sw.update).toHaveBeenCalledWith(true)
  })

  it('logs a failed activation instead of throwing', async () => {
    sw.update = vi.fn().mockRejectedValue(new Error('no worker'))
    const store = useAppUpdateStore()

    await store.activate()

    expect(console.error).toHaveBeenCalled()
  })

  it('asks the registration for an update on check', () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const store = useAppUpdateStore()
    register(update)
    update.mockClear()

    store.check()

    expect(update).toHaveBeenCalledOnce()
  })

  it('checks nothing before a worker is registered', () => {
    const store = useAppUpdateStore()

    expect(() => {
      store.check()
    }).not.toThrow()
  })

  it('logs a failed update check and a failed registration', async () => {
    const update = vi.fn().mockRejectedValue(new Error('offline'))
    const store = useAppUpdateStore()
    register(update)
    store.check()
    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalled()
    })
    vi.mocked(console.error).mockClear()

    sw.options?.onRegisterError?.(new Error('blocked'))

    expect(console.error).toHaveBeenCalled()
  })
})
