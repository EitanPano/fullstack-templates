import { useSearchParams } from 'react-router'

import { SignInForm } from '@/feature/auth/ui/sign-in-form'
import { safeNextPath } from '@/shared/auth/next-path'
import { AuthCard } from '@/shared/ui/pattern/auth-card'

// The sign-in card. `next` (the page the visitor was sent away from) is checked by
// `safeNextPath` before it reaches the form and again when the form navigates; the route's
// loader already keeps signed-in accounts out.
export function SignIn() {
  const [params] = useSearchParams()
  const target = safeNextPath(params.get('next'))
  return (
    <AuthCard title="Sign in" description="Welcome back.">
      <SignInForm next={target === '/' ? undefined : target} />
    </AuthCard>
  )
}
