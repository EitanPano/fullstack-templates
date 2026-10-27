import { Suspense } from 'react'

import { Page, PageHeader } from '@/shared/ui/pattern/page-layout'
import { CardSkeleton } from '@/shared/ui/pattern/skeletons'
import { ProfileCard } from '@/widget/profile/ui/profile-card'

// A page only an account sees: its loader (routes.tsx) calls `requireAccount`, the page stays a
// header and a widget. Copy this pair for the next signed-in screen.
export default function ProfilePage() {
  return (
    <Page>
      <title>Profile · __PROJECT_DISPLAY_NAME__</title>
      {/* Only a hint to crawlers that run no script; the loader's guard is the protection. */}
      <meta name="robots" content="noindex" />
      <PageHeader title="Profile" />
      <Suspense fallback={<CardSkeleton />}>
        <ProfileCard />
      </Suspense>
    </Page>
  )
}
