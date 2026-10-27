'use client'

import { RefreshCwIcon } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'

import { Button } from '@/shared/ui/button'

import { refreshHealth } from '../server/action'

// The interactive leaf: runs its action and shows the outcome with a toast from the handler,
// after the await, never from an effect (the toast must survive the component unmounting).
export function RefreshHealthButton() {
  const { executeAsync, isPending } = useAction(refreshHealth)

  async function refreshStatus() {
    const result = await executeAsync()
    if (result.serverError === undefined) toast.success('Status refreshed')
    else toast.error(result.serverError, { description: 'Start the API and try again.' })
  }

  return (
    <Button variant="outline" onClick={refreshStatus} disabled={isPending} className="w-fit">
      <RefreshCwIcon aria-hidden className={isPending ? 'animate-spin' : undefined} />
      Refresh
    </Button>
  )
}
