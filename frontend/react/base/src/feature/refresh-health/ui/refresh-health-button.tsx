import { RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'

import { ActionError } from '@/shared/lib/action-error'
import { Button } from '@/shared/ui/button'

import { useRefreshHealth } from '../api/refresh-health'

// The interactive leaf: runs its mutation and shows the outcome with a toast from the handler,
// after the await, never from an effect (the toast must survive the component unmounting).
export function RefreshHealthButton() {
  const { mutateAsync, isPending } = useRefreshHealth()

  async function refreshStatus() {
    try {
      await mutateAsync()
      toast.success('Status refreshed')
    } catch (error) {
      toast.error(error instanceof ActionError ? error.message : 'Something went wrong.', {
        description: 'Start the API and try again.',
      })
    }
  }

  return (
    <Button variant="outline" onClick={refreshStatus} disabled={isPending} className="w-fit">
      <RefreshCwIcon aria-hidden className={isPending ? 'animate-spin' : undefined} />
      Refresh
    </Button>
  )
}
