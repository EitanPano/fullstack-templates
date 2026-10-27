import { Suspense } from 'react'

import { Page, PageHeader } from '@/shared/ui/pattern/page-layout'
import { SystemStatus } from '@/widget/system-status/ui/system-status'
import { SystemStatusSkeleton } from '@/widget/system-status/ui/system-status-skeleton'

// A page is a header and widgets, each in its own Suspense with the widget's skeleton; nothing
// else lives in app/. Its loader (routes.tsx) prefetches what the widgets read.
export default function HomePage() {
  return (
    <Page>
      <title>Home · __PROJECT_DISPLAY_NAME__</title>
      <PageHeader title="Home" description="Replace this page with the first feature." />
      <Suspense fallback={<SystemStatusSkeleton />}>
        <SystemStatus />
      </Suspense>
    </Page>
  )
}
