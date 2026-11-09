import { useSearchParams } from 'react-router'

import { SignInForm } from '@/pages/auth/components/sign-in-form'
import { AuthCard } from '@/shared/components/auth-card'
import { safeNextPath } from '@/shared/utils/next-path'

// `next` (the page the visitor was sent away from) is checked by `safeNextPath` here and again
// when the form navigates; the route's loader already keeps signed-in accounts out.
function SignInPage() {
  const [params] = useSearchParams()
  const target = safeNextPath(params.get('next'))
  return (
    <>
      <title>Sign in · __PROJECT_DISPLAY_NAME__</title>
      <AuthCard title="Sign in" description="Welcome back.">
        <SignInForm next={target === '/' ? undefined : target} />
      </AuthCard>
    </>
  )
}

export { SignInPage as Component }
