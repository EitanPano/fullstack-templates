import { afterEach, describe, expect, it, vi } from 'vitest'

import { useRequestStatus } from './request-status'

describe('useRequestStatus', () => {
  it('starts idle with no error', () => {
    const { status, error, loading, loaded, failed } = useRequestStatus()

    expect(status.value).toBe('idle')
    expect(error.value).toBeNull()
    expect([loading.value, loaded.value, failed.value]).toEqual([false, false, false])
  })

  it('moves through loading, loaded and error, clearing the error on the way', () => {
    const { status, error, loading, loaded, failed, setLoading, setLoaded, setError } =
      useRequestStatus()

    setError({ code: 'network' })
    expect(status.value).toBe('error')
    expect(error.value).toEqual({ code: 'network' })
    expect(failed.value).toBe(true)

    setLoading()
    expect(loading.value).toBe(true)
    expect(error.value).toBeNull()

    setLoaded()
    expect(loaded.value).toBe(true)
    expect(loading.value).toBe(false)
  })

  it('keeps two independent requests apart when called twice', () => {
    const list = useRequestStatus()
    const save = useRequestStatus()

    list.setLoading()

    expect(list.loading.value).toBe(true)
    expect(save.loading.value).toBe(false)
  })

  describe('fail', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('keeps an ApiError as it is, returns it and logs nothing', () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { status, error, fail } = useRequestStatus()
      const cause = { code: 'conflict', status: 409 } as const

      const result = fail(cause, 'user.save')

      expect(result).toBe(cause)
      expect(status.value).toBe('error')
      expect(error.value).toEqual(cause)
      expect(logged).not.toHaveBeenCalled()
    })

    it('logs a plain Error once and keeps unknown with its context', () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { error, fail } = useRequestStatus()

      const result = fail(new Error('bug'), 'user.save')

      expect(result).toEqual({ code: 'unknown', context: 'user.save' })
      expect(error.value).toEqual(result)
      expect(logged).toHaveBeenCalledOnce()
    })

    it('logs a non-Error value once and keeps unknown', () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { fail } = useRequestStatus()

      expect(fail('oops')).toEqual({ code: 'unknown' })
      expect(logged).toHaveBeenCalledOnce()
    })
  })
})
