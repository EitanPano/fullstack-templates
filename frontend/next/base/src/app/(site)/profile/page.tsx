import type { Metadata } from 'next'
import { Suspense } from 'react'

import { Page, PageHeader } from '@/shared/components/page'
import { CardSkeleton } from '@/shared/components/skeletons'
import { ProfileCard } from './_components/profile-card'
import { SignOutButton } from './_components/sign-out-button'

export const metadata: Metadata = { title: 'Profile', robots: { index: false } }

// A page only an account sees: `ProfileCard` guards it (`requireAccount`), the page stays a static
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
