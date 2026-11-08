import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLoadingStore } from './loading.store'

describe('loading store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is idle until a request starts', () => {
    const store = useLoadingStore()

    expect(store.pending).toBe(0)
    expect(store.busy).toBe(false)
  })

  it('is busy while any request is in flight', () => {
    const store = useLoadingStore()

    store.start()
    store.start()
    store.stop()
    expect(store.busy).toBe(true)

    store.stop()
    expect(store.busy).toBe(false)
  })

  it('never counts below zero', () => {
    const store = useLoadingStore()

    store.stop()

    expect(store.pending).toBe(0)
  })
})
