import { RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRevalidator } from 'react-router'
import { toast } from 'sonner'

// Re-runs the route's loaders through the router; the button never calls the API itself.
// `revalidate()` resolves even when a loader fails, so the toast fires from the loading to
// idle transition instead: a failed reload swaps the page for the route's error boundary
// (which has its own retry), the button unmounts and no success is announced.
export function RefreshButton() {
  const { revalidate, state } = useRevalidator()
  // 'idle' until pressed, 'waiting' until the router starts loading, then 'loading'.
  const phase = useRef<'idle' | 'waiting' | 'loading'>('idle')
  const pending = state === 'loading'

  useEffect(() => {
    if (state === 'loading' && phase.current === 'waiting') phase.current = 'loading'
    else if (state === 'idle' && phase.current === 'loading') {
      phase.current = 'idle'
      toast.success('Status refreshed')
    }
  }, [state])

  return (
    <button
      type="button"
      onClick={() => {
        phase.current = 'waiting'
        void revalidate()
      }}
      disabled={pending}
      className="inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1 text-sm hover:bg-foreground/5 disabled:opacity-50"
    >
      <RefreshCw aria-hidden className={`size-4 ${pending ? 'animate-spin' : ''}`} />
      Refresh
    </button>
  )
}
