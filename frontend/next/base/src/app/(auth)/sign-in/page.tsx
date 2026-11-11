import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AppAuthLoading } from '@/layout/app-auth-loading/app-auth-loading'
import { SignIn } from './_components/sign-in/sign-in'

export const metadata: Metadata = { title: 'Sign in' }

// The page is a static shell; `SignIn` reads the query, so it is a request-time hole inside
// Suspense.
export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback={<AppAuthLoading />}>
      <SignIn searchParams={searchParams} />
    </Suspense>
  )
}
