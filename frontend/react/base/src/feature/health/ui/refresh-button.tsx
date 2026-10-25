import { RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRevalidator } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/shared/ui/button'

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
    <Button
      onClick={() => {
        phase.current = 'waiting'
        void revalidate()
      }}
      disabled={pending}
      className="w-fit"
    >
      <RefreshCw aria-hidden className={`size-4 ${pending ? 'animate-spin' : ''}`} />
      Refresh
    </Button>
  )
}
