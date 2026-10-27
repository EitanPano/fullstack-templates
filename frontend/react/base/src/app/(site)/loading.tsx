import { Skeleton } from '@/shared/ui/skeleton'

// The HydrateFallback of every route in the group: a header-shaped placeholder, shown while the
// first loader runs.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-72 max-w-full" />
    </div>
  )
}
