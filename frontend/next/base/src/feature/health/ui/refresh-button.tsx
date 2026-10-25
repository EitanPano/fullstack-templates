'use client'

import { RefreshCw } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import type { ActionResult } from '@/shared/lib/action'
import { Button } from '@/shared/ui/button'

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
    <Button onClick={refresh} disabled={pending} className="w-fit">
      <RefreshCw aria-hidden className={`size-4 ${pending ? 'animate-spin' : ''}`} />
      Refresh
    </Button>
  )
}
