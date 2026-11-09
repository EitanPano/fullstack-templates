import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/shared/components/card'
import { Skeleton } from '@/shared/components/skeleton'

// The same card, title and slots as SystemStatus, so nothing shifts when the data arrives.
export function SystemStatusSkeleton() {
  return (
    <Card role="group" aria-busy="true" aria-label="Loading system status">
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardAction>
          <Skeleton className="system-status__skeleton-button" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Skeleton className="system-status__skeleton-badge" />
      </CardContent>
    </Card>
  )
}
