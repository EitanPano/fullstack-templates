import type { Metadata } from 'next'
import { Suspense } from 'react'

import { Page, PageHeader } from '@/shared/ui/pattern/page-layout'
import { CardSkeleton } from '@/shared/ui/pattern/skeletons'
import { ProfileCard } from '@/widget/profile/ui/profile-card'

export const metadata: Metadata = { title: 'Profile', robots: { index: false } }

// A page only an account sees: the widget guards it (`requireAccount`), the page stays a static
// shell. Copy this pair for the next signed-in screen.
export default function ProfilePage() {
  return (
    <Page>
      <PageHeader title="Profile" />
      <Suspense fallback={<CardSkeleton />}>
        <ProfileCard />
      </Suspense>
    </Page>
  )
}
