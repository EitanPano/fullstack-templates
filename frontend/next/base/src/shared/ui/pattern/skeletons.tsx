import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'

// Skeleton shapes for widgets: a widget's own skeleton composes these to match its layout.
export function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-1/3" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  )
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}

// @server:auth-start
// The shape of the sign-in and sign-up cards: a title, three fields and a button.
export function AuthCardSkeleton() {
  return (
    <Card role="status" aria-label="Loading" aria-busy="true" className="mx-auto w-full max-w-sm">
      <CardHeader>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Skeleton className="h-9 w-full pointer-coarse:h-11" />
        <Skeleton className="h-9 w-full pointer-coarse:h-11" />
        <Skeleton className="h-9 w-full pointer-coarse:h-11" />
      </CardContent>
    </Card>
  )
}
// @server:auth-end
