import { SignUpForm } from '@/feature/auth/ui/sign-up-form'
import { safeNextPath } from '@/shared/auth/next-path'
import { AuthCard } from '@/shared/ui/pattern/auth-card'

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
