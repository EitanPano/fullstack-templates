import { useSearchParams } from 'react-router'

import { SignUpForm } from '@/features/auth/components/sign-up-form'
import { AuthCard } from '@/shared/components/auth-card'
import { safeNextPath } from '@/shared/utils/next-path'

function SignUpPage() {
  const [params] = useSearchParams()
  const target = safeNextPath(params.get('next'))
  return (
    <>
      <title>Create account · __PROJECT_DISPLAY_NAME__</title>
      <AuthCard title="Create your account" description="It takes a minute.">
        <SignUpForm next={target === '/' ? undefined : target} />
      </AuthCard>
    </>
  )
}

export { SignUpPage as Component }
