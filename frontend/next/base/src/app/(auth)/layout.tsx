import { Suspense, type ReactNode } from 'react'

import { AuthCardSkeleton } from '@/shared/ui/pattern/skeletons'
import { GuestOnly } from '@/widget/guest-only/ui/guest-only'

// The frame of the sign-in and sign-up screens: no shell, one centred `main`. The screen's card
// supplies the page's `h1`. An account that is already signed in never sees these screens: the
// gate is a request-time hole (it reads the session), so the static shell stays prerendered.
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-8"
    >
      <Suspense fallback={<AuthCardSkeleton />}>
        <GuestOnly>{children}</GuestOnly>
      </Suspense>
    </main>
  )
}
