import { Injectable } from '@angular/core'

export type StorageArea = 'local' | 'session'

// Keys that name a credential are refused: tokens live in HttpOnly cookies, never in web storage.
const FORBIDDEN_KEY = /token|password|secret|authorization/i

// Typed, JSON-encoded access to web storage. Quota errors, blocked storage (privacy mode) and
// corrupt values never throw: a read falls back to null, a write reports false.
@Injectable({ providedIn: 'root' })
export class StorageService {
  get(key: string, area: StorageArea = 'local'): unknown {
    try {
      const raw = this.area(area).getItem(key)
      return raw === null ? null : (JSON.parse(raw) as unknown)
    } catch {
      return null
    }
  }

  set(key: string, value: unknown, area: StorageArea = 'local'): boolean {
    if (FORBIDDEN_KEY.test(key)) return false
    try {
      this.area(area).setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  }

  remove(key: string, area: StorageArea = 'local'): void {
    try {
      this.area(area).removeItem(key)
    } catch {
      // Blocked storage: there is nothing to remove.
    }
  }

  private area(area: StorageArea): Storage {
    return area === 'local' ? localStorage : sessionStorage
  }
}
