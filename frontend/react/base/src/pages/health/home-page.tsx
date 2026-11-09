import { SystemStatus } from '@/pages/health/components/system-status'
import { Page, PageHeader } from '@/shared/components/page'
import './home-page.scss'

// The home screen. The route loader has already put the health read in the cache, so the status
// card answers at once and renders without a skeleton.
function HomePage() {
  return (
    <Page>
      <title>Home · __PROJECT_DISPLAY_NAME__</title>
      <PageHeader title="Home" description="Replace this page with the first feature." />
      <SystemStatus />
    </Page>
  )
}

export { HomePage as Component }
