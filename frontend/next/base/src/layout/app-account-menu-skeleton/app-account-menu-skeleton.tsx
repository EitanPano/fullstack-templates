import { Skeleton } from '@/shared/components/skeleton/skeleton'
import './app-account-menu-skeleton.scss'

// The size of the avatar trigger, so the header does not shift when the account arrives. It
// carries no role: the page's own status regions stay the only ones announced.
export function AppAccountMenuSkeleton() {
  return <Skeleton className="account-menu__skeleton" />
}
