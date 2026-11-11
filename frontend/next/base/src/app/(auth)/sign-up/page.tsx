import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AppAuthLoading } from '@/components/app-auth-loading'
import { SignUp } from './_components/sign-up'

export const metadata: Metadata = { title: 'Create account' }

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback={<AppAuthLoading />}>
      <SignUp searchParams={searchParams} />
    </Suspense>
  )
}
