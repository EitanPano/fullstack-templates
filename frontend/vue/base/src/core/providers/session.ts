import { STORAGE_KEYS } from '@/core/config/constants'

import { storage } from './storage'

const HINT = '1'

// The session hint: "this browser signed in", never a token (the session is two HttpOnly cookies).
// It spares a visitor the refresh a 401 would cost. The auth store sets it after sign-in and
// sign-up and clears it on sign-out; a refused refresh clears it too (auth.interceptor.ts).
// Nothing else reads it.
export function hasSessionHint(): boolean {
  return storage.get(STORAGE_KEYS.sessionHint) === HINT
}

export function setSessionHint(): void {
  storage.set(STORAGE_KEYS.sessionHint, HINT)
}

export function clearSessionHint(): void {
  storage.remove(STORAGE_KEYS.sessionHint)
}

type Listener = () => void

const listeners = new Set<Listener>()

// The fetch wrapper cannot import the auth store (the store reaches the client through the SDK, so
// that would be an import cycle). It tells whoever listens that the session is over; the session
// initializer subscribes once. Returns the unsubscribe function.
export function onSessionLost(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// A listener that throws must neither stop the others nor change what the caller (the refresh)
// returns, and its error must not vanish: it is rethrown on a microtask, where it surfaces as an
// unhandled error and reaches the window's error reporting.
export function emitSessionLost(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch (cause) {
      queueMicrotask(() => {
        throw cause
      })
    }
  }
}
