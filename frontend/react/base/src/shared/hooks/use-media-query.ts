import { useCallback, useSyncExternalStore } from 'react'

// Whether a CSS media query matches now, and again whenever it changes. The server snapshot is
// false: there is no viewport to ask. The callbacks depend on the query alone, so a rerender
// does not resubscribe.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => {
        list.removeEventListener('change', notify)
      }
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
