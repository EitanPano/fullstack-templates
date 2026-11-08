export type StorageArea = 'local' | 'session'

// Keys that name a credential are refused: tokens live in HttpOnly cookies, never in web storage.
const FORBIDDEN_KEY = /token|password|secret|authorization/i

function area(name: StorageArea): Storage {
  return name === 'local' ? localStorage : sessionStorage
}

// Typed, JSON-encoded access to web storage. Quota errors, blocked storage (privacy mode) and
// corrupt values never throw: a read falls back to null, a write reports false.
export const storage = {
  get(key: string, name: StorageArea = 'local'): unknown {
    try {
      const raw = area(name).getItem(key)
      return raw === null ? null : (JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  },

  set(key: string, value: unknown, name: StorageArea = 'local'): boolean {
    if (FORBIDDEN_KEY.test(key)) return false
    try {
      area(name).setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },

  remove(key: string, name: StorageArea = 'local'): void {
    try {
      area(name).removeItem(key)
    } catch {
      // Blocked storage: there is nothing to remove.
    }
  },
}
