import { HealthBadge } from '@/features/health/components/health-badge'
import { RefreshHealthButton } from '@/features/health/components/refresh-health-button'
import { SystemStatusSkeleton } from '@/features/health/components/system-status-skeleton'
import { useGetHealthQuery } from '@/services/health.api'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/shared/components/card'
import { ErrorState } from '@/shared/components/error-state'
import { isApiError } from '@/models/api-error'

// The liveness card. The loader normally fills the cache first, so the skeleton shows only when
// the entry is evicted; a failed refetch renders in place with a retry.
export function SystemStatus() {
  const { data, error, isLoading, isError, isFetching, refetch } = useGetHealthQuery()

  if (isLoading) return <SystemStatusSkeleton />

  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardAction>
          <RefreshHealthButton />
        </CardAction>
      </CardHeader>
      <CardContent>
        {isError || !data ? (
          <ErrorState
            title="Can't reach the API"
            description={isApiError(error) ? error.message : 'Something went wrong. Try again.'}
            retrying={isFetching}
            onRetry={() => void refetch()}
          />
        ) : (
          <HealthBadge health={data} />
        )}
      </CardContent>
    </Card>
  )
}
