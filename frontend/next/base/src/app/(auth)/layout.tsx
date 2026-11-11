import { Suspense, type ReactNode } from 'react'

import { AppAuthLoading } from '@/layout/app-auth-loading/app-auth-loading'
import { GuestOnly } from './_components/guest-only/guest-only'
import './layout.scss'

// The frame of the sign-in and sign-up screens: no shell, one centred `main`. The screen's card
// supplies the page's `h1`. An account that is already signed in never sees these screens: the
// gate is a request-time hole (it reads the session), so the static shell stays prerendered.
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main id="main" tabIndex={-1} className="auth-layout">
      <Suspense fallback={<AppAuthLoading />}>
        <GuestOnly>{children}</GuestOnly>
      </Suspense>
    </main>
  )
}
