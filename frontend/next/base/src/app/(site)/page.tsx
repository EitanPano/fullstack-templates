import type { Metadata } from 'next'
import { Suspense } from 'react'

import { PageHeader, Page } from '@/shared/ui/pattern/page-layout'
import { SystemStatus } from '@/widget/system-status/ui/system-status'
import { SystemStatusSkeleton } from '@/widget/system-status/ui/system-status-skeleton'

export const metadata: Metadata = { title: 'Home' }

// A page is a header and widgets, each in its own Suspense with the widget's skeleton; nothing
// else lives in app/.
export default function HomePage() {
  return (
    <Page>
      <PageHeader title="Home" description="Replace this page with the first feature." />
      <Suspense fallback={<SystemStatusSkeleton />}>
        <SystemStatus />
      </Suspense>
    </Page>
  )
}
