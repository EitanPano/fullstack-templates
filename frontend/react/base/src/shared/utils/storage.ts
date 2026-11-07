// localStorage that never throws: a private window or blocked site data reads as empty and a
// write is dropped, so the choice then lasts until the page closes.
export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Blocked storage: nothing to persist to.
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Blocked storage: nothing to remove.
  }
}
