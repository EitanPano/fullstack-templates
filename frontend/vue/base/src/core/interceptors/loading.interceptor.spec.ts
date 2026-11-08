import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLoadingStore } from '@/store/loading.store'

import { withLoading } from './loading.interceptor'

describe('withLoading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('counts a request while it is in flight and not after a success', async () => {
    const loading = useLoadingStore()
    let seen = -1
    const inner = vi.fn(() => {
      seen = loading.pending
      return Promise.resolve(new Response('ok'))
    })

    const response = await withLoading(inner)('http://localhost/api/x')

    expect(await response.text()).toBe('ok')
    expect(seen).toBe(1)
    expect(loading.pending).toBe(0)
  })

  it('counts down after a failed response (it is still a response)', async () => {
    const loading = useLoadingStore()
    const inner = vi.fn(() => Promise.resolve(new Response(null, { status: 500 })))

    const response = await withLoading(inner)('http://localhost/api/x')

    expect(response.status).toBe(500)
    expect(loading.pending).toBe(0)
  })

  it('counts down after a thrown fetch and rethrows it', async () => {
    const loading = useLoadingStore()
    const failure = new TypeError('Failed to fetch')
    const inner = vi.fn(() => Promise.reject(failure))

    await expect(withLoading(inner)('http://localhost/api/x')).rejects.toBe(failure)

    expect(loading.pending).toBe(0)
  })

  it('counts concurrent requests', async () => {
    const loading = useLoadingStore()
    const peaks: number[] = []
    const inner = vi.fn(() => {
      peaks.push(loading.pending)
      return Promise.resolve(new Response('ok'))
    })
    const wrapped = withLoading(inner)

    await Promise.all([wrapped('http://localhost/a'), wrapped('http://localhost/b')])

    expect(Math.max(...peaks)).toBe(2)
    expect(loading.pending).toBe(0)
  })

  it('passes the request and init to the inner fetch untouched', async () => {
    const inner = vi.fn(() => Promise.resolve(new Response('ok')))
    const init = { method: 'POST' }

    await withLoading(inner)('http://localhost/api/x', init)

    expect(inner).toHaveBeenCalledWith('http://localhost/api/x', init)
  })

  it('resolves the global fetch on every call when no inner is given', async () => {
    const wrapped = withLoading()
    const later = vi.fn(() => Promise.resolve(new Response('late')))
    vi.stubGlobal('fetch', later)

    const response = await wrapped('http://localhost/api/x')

    expect(await response.text()).toBe('late')
    expect(later).toHaveBeenCalledOnce()
  })
})
