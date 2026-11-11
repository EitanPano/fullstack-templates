import { Page } from '@/shared/components/page/page'
import { CardSkeleton } from '@/shared/components/skeletons'
import './app-main-loading.scss'

// The group HydrateFallback: shown while a page module or its loader is pending, inside the
// layout, so the skip link and main stay put.
export function AppMainLoading() {
  return (
    <Page className="main-loading" role="status" aria-busy="true">
      <span className="visually-hidden">Loading</span>
      <CardSkeleton />
    </Page>
  )
}
