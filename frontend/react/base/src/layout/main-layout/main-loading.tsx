import { Page } from '@/shared/components/page'
import { CardSkeleton } from '@/shared/components/skeletons'

// The group HydrateFallback: shown while a page module or its loader is pending, inside the
// shell, so the header does not flash away.
export function MainLoading() {
  return (
    <Page className="main-loading" role="status" aria-busy="true">
      <span className="visually-hidden">Loading</span>
      <CardSkeleton />
    </Page>
  )
}
