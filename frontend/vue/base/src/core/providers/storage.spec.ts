import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { storage } from './storage'

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips a JSON value in local storage', () => {
    expect(storage.set('prefs', { a: 1 })).toBe(true)

    expect(storage.get('prefs')).toEqual({ a: 1 })
  })

  it('reads and writes the area it is asked for', () => {
    storage.set('k', 'v', 'session')

    expect(sessionStorage.getItem('k')).toBe('"v"')
    expect(storage.get('k')).toBeNull()
    expect(storage.get('k', 'session')).toBe('v')
  })

  it('answers null for a missing key and for a corrupt value', () => {
    localStorage.setItem('bad', '{not json')

    expect(storage.get('missing')).toBeNull()
    expect(storage.get('bad')).toBeNull()
  })

  it('refuses a key that names a credential', () => {
    expect(storage.set('access-token', 'x')).toBe(false)
    expect(storage.set('Password', 'x')).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  it('reports false instead of throwing when the quota or privacy mode blocks a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(storage.set('k', 'v')).toBe(false)
  })

  it('removes a key and survives blocked storage', () => {
    storage.set('k', 'v')
    storage.remove('k')
    expect(storage.get('k')).toBeNull()

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => {
      storage.remove('k')
    }).not.toThrow()
  })
})
