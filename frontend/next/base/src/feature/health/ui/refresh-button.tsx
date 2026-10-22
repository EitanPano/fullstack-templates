'use client'

import { RefreshCw } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import type { ActionResult } from '@/shared/lib/action'

// A client leaf: receives the server action as a prop, shows the outcome with a toast.
export function RefreshButton({ action }: { action: () => Promise<ActionResult> }) {
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.success('Status refreshed')
      else toast.error(result.error, { description: 'Start the API and try again.' })
    })
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      className="inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1 text-sm hover:bg-foreground/5 disabled:opacity-50"
    >
      <RefreshCw aria-hidden className={`size-4 ${pending ? 'animate-spin' : ''}`} />
      Refresh
    </button>
  )
}
