import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNetworkStore } from './network.store'

describe('network store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts from navigator.onLine', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(useNetworkStore().online).toBe(false)
  })

  it('follows the window online and offline events', () => {
    const store = useNetworkStore()

    window.dispatchEvent(new Event('offline'))
    expect(store.online).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(store.online).toBe(true)
  })

  it('stops listening when the store is disposed', () => {
    const store = useNetworkStore()
    store.$dispose()

    window.dispatchEvent(new Event('offline'))

    expect(store.online).toBe(true)
  })
})
