import { TestBed } from '@angular/core/testing'

import { StorageService } from './storage.service'

describe('StorageService', () => {
  let storage: StorageService

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    storage = TestBed.inject(StorageService)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips JSON values in the chosen area', () => {
    expect(storage.set('prefs', { a: 1 })).toBe(true)
    expect(storage.set('tab', 'x', 'session')).toBe(true)
    expect(storage.get('prefs')).toEqual({ a: 1 })
    expect(storage.get('tab', 'session')).toBe('x')
    expect(storage.get('tab')).toBeNull()
  })

  it('removes a key', () => {
    storage.set('prefs', 1)
    storage.remove('prefs')
    expect(storage.get('prefs')).toBeNull()
  })

  it('returns null for a missing key and for a corrupt value', () => {
    expect(storage.get('missing')).toBeNull()
    localStorage.setItem('broken', '{not json')
    expect(storage.get('broken')).toBeNull()
  })

  it('swallows quota and blocked-storage errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(storage.set('a', 1)).toBe(false)
    expect(storage.get('a')).toBeNull()
    expect(() => {
      storage.remove('a')
    }).not.toThrow()
  })

  it('refuses to store a credential', () => {
    expect(storage.set('accessToken', 'abc')).toBe(false)
    expect(storage.set('user-password', 'abc', 'session')).toBe(false)
    expect(localStorage.length).toBe(0)
  })
})
