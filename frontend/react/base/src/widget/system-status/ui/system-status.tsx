import { useSuspenseQuery } from '@tanstack/react-query'

import { healthQuery } from '@/entity/health/api/health'
import { HealthBadge } from '@/entity/health/ui/health-badge'
import { RefreshHealthButton } from '@/feature/refresh-health/ui/refresh-health-button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'

// A widget: it suspends on its query, and its page wraps it in Suspense with
// `SystemStatusSkeleton`. The route loader already prefetched the query, so the data is there on
// the first render; a failed refetch reaches the route group's error boundary.
export function SystemStatus() {
  const { data: health } = useSuspenseQuery(healthQuery())
  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardAction>
          <RefreshHealthButton />
        </CardAction>
      </CardHeader>
      <CardContent>
        <HealthBadge health={health} />
      </CardContent>
    </Card>
  )
}
