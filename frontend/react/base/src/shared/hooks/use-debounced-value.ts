import { useEffect, useState } from 'react'

// The value, `ms` after it last changed. A change inside the delay restarts it; unmount clears it.
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, ms)
    return () => {
      clearTimeout(timer)
    }
  }, [value, ms])

  return debounced
}
