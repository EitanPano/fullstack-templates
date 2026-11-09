import { useSyncExternalStore } from 'react'

// Whether a CSS media query matches now, and again whenever it changes. The server snapshot is
// false: there is no viewport to ask.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => {
        list.removeEventListener('change', notify)
      }
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
