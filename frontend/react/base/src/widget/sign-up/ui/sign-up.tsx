import { useSearchParams } from 'react-router'

import { SignUpForm } from '@/feature/auth/ui/sign-up-form'
import { safeNextPath } from '@/shared/auth/next-path'
import { AuthCard } from '@/shared/ui/pattern/auth-card'

export function SignUp() {
  const [params] = useSearchParams()
  const target = safeNextPath(params.get('next'))
  return (
    <AuthCard title="Create your account" description="It takes a minute.">
      <SignUpForm next={target === '/' ? undefined : target} />
    </AuthCard>
  )
}
