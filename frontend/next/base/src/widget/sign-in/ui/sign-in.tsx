import { SignInForm } from '@/feature/auth/ui/sign-in-form'
import { safeNextPath } from '@/shared/auth/next-path'
import { AuthCard } from '@/shared/ui/pattern/auth-card'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

// The sign-in card. `next` (the page the visitor was sent away from) is checked by
// `safeNextPath` here and again by the action; the (auth) layout already keeps signed-in
// accounts out.
export async function SignIn({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams
  const target = safeNextPath(next)
  return (
    <AuthCard title="Sign in" description="Welcome back.">
      <SignInForm next={target === '/' ? undefined : target} />
    </AuthCard>
  )
}
