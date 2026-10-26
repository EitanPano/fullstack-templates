import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AuthCardSkeleton } from '@/shared/ui/pattern/skeletons'
import { SignIn } from '@/widget/sign-in/ui/sign-in'

export const metadata: Metadata = { title: 'Sign in' }

// The page is a static shell; the widget reads the query, so it is a request-time hole inside
// Suspense.
export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <SignIn searchParams={searchParams} />
    </Suspense>
  )
}
