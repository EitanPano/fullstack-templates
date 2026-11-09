import { CardSkeleton } from '@/shared/components/skeletons'

// The HydrateFallback of every auth screen, inside the layout's `main`: a card-shaped placeholder
// while the page module or its loader is pending.
export function AuthLoading() {
  return (
    <div className="auth-loading" role="status" aria-busy="true" aria-label="Loading">
      <CardSkeleton />
    </div>
  )
}
