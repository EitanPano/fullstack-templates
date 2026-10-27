import { Skeleton } from '@/shared/ui/skeleton'

// The size of the avatar trigger, so the header does not shift when the account arrives. It
// carries no role: the page's own status regions stay the only ones announced.
export function AccountMenuSkeleton() {
  return <Skeleton aria-hidden className="size-9 rounded-full pointer-coarse:size-11" />
}
