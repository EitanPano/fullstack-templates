import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'

// Same card, title and slots as SystemStatus, so the page does not shift when data arrives.
export function SystemStatusSkeleton() {
  return (
    <Card role="status" aria-label="Loading system status" aria-busy="true">
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardAction>
          <Skeleton className="h-9 w-24 pointer-coarse:h-11" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-6 w-56 rounded-full" />
      </CardContent>
    </Card>
  )
}
