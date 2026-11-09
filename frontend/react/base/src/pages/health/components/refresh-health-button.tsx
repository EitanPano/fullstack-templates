import { RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'

import { REFRESH_COPY } from '@/features/health/health.copy'
import { isApiError } from '@/models/api-error'
import { Button } from '@/shared/components/button'
import { useRefreshHealthMutation } from '@/services/health.api'

// Pings the API again. The mutation invalidates the Health tag, so the badge refetches on its own;
// this button only reports the outcome.
export function RefreshHealthButton() {
  const [trigger, { isLoading }] = useRefreshHealthMutation()

  async function refresh() {
    try {
      await trigger().unwrap()
      toast.success(REFRESH_COPY.success)
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Something went wrong.', {
        description: REFRESH_COPY.failureHint,
      })
    }
  }

  return (
    <Button variant="secondary" disabled={isLoading} onClick={() => void refresh()}>
      <RefreshCwIcon
        aria-hidden="true"
        className={isLoading ? 'icon refresh-icon refresh-icon--spinning' : 'icon refresh-icon'}
      />
      Refresh
    </Button>
  )
}
