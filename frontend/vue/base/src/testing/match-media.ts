import { vi } from 'vitest'

type Listener = (event: { matches: boolean; media: string }) => void

// Replaces window.matchMedia with a controllable one: `initial` decides each query, and
// `flip(query, value)` changes one and notifies its listeners, as the browser does on a resize.
export function stubMatchMedia(initial: Record<string, boolean> = {}) {
  const state = new Map(Object.entries(initial))
  const listeners = new Map<string, Set<Listener>>()

  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return state.get(query) ?? false
    },
    media: query,
    addEventListener: (_: string, listener: Listener) => {
      const registered = listeners.get(query) ?? new Set<Listener>()
      registered.add(listener)
      listeners.set(query, registered)
    },
    removeEventListener: (_: string, listener: Listener) => {
      listeners.get(query)?.delete(listener)
    },
  }))

  return {
    flip(query: string, value: boolean) {
      state.set(query, value)
      for (const listener of listeners.get(query) ?? []) listener({ matches: value, media: query })
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0
    },
  }
}

// The query the layout treats as "lg and up" (the lg breakpoint in styles/setup/_breakpoints.scss).
export const DESKTOP_QUERY = '(min-width: 1024px)'
