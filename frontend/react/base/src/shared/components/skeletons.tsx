import { Card, CardContent, CardHeader } from '@/shared/components/card/card'
import { Skeleton } from '@/shared/components/skeleton/skeleton'

// Skeleton shapes for a loading state; a widget composes these to match its own layout.
export function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton shape="title" />
      </CardHeader>
      <CardContent>
        <Skeleton />
        <Skeleton shape="short" />
      </CardContent>
    </Card>
  )
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} shape="row" />
      ))}
    </div>
  )
}
