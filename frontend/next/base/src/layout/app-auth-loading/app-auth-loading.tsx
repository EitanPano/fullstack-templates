import { CardSkeleton } from '@/shared/components/skeletons'
import './app-auth-loading.scss'

// The loading placeholder of every auth screen, inside the layout's `main`: a card-shaped
// skeleton in the card's measure while the page or its session read is pending.
export function AppAuthLoading() {
  return (
    <div className="auth-loading" role="status" aria-busy="true" aria-label="Loading">
      <CardSkeleton />
    </div>
  )
}
