import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AuthCardSkeleton } from '@/shared/ui/pattern/skeletons'
import { SignUp } from '@/widget/sign-up/ui/sign-up'

export const metadata: Metadata = { title: 'Create account' }

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <SignUp searchParams={searchParams} />
    </Suspense>
  )
}
