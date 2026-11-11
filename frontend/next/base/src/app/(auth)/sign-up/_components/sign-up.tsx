import { safeNextPath } from '@/core/auth/next-path'
import { AuthCard } from '@/shared/components/auth-card'
import { SignUpForm } from './sign-up-form'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function SignUp({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams
  const target = safeNextPath(next)
  return (
    <AuthCard title="Create your account" description="It takes a minute.">
      <SignUpForm next={target === '/' ? undefined : target} />
    </AuthCard>
  )
}
