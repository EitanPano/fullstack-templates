import type { Metadata } from 'next'
import { Suspense } from 'react'

import { SignOutButton } from './_components/sign-out-button'
import { Page, PageHeader } from '@/shared/ui/pattern/page-layout'
import { CardSkeleton } from '@/shared/ui/pattern/skeletons'
import { ProfileCard } from './_components/profile-card'

export const metadata: Metadata = { title: 'Profile', robots: { index: false } }

// A page only an account sees: the widget guards it (`requireAccount`), the page stays a static
// shell. The header carries Sign out, the way out of a session. Copy this pair for the next
// signed-in screen.
export default function ProfilePage() {
  return (
    <Page>
      <PageHeader title="Profile" actions={<SignOutButton />} />
      <Suspense fallback={<CardSkeleton />}>
        <ProfileCard />
      </Suspense>
    </Page>
  )
}
