import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearSessionHint, hasSessionHint, setSessionHint } from '@/shared/api/session-hint'

afterEach(() => {
  vi.restoreAllMocks()
  clearSessionHint()
})

describe('the session hint', () => {
  it('is set, read and cleared', () => {
    expect(hasSessionHint()).toBe(false)
    setSessionHint()
    expect(hasSessionHint()).toBe(true)
    clearSessionHint()
    expect(hasSessionHint()).toBe(false)
  })

  it('stays absent, without throwing, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(() => {
      setSessionHint()
      clearSessionHint()
    }).not.toThrow()
    expect(hasSessionHint()).toBe(false)
  })
})
