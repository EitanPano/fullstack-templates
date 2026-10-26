import { requireAccount } from '@/shared/auth/session'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'

// The guarded-page example: `requireAccount` sends a visitor to sign-in with this page's path,
// and sign-in brings them back. It is a request-time hole (it reads the session), so its page
// wraps it in Suspense and the shell stays prerendered.
export async function ProfileCard() {
  const { user } = await requireAccount('/profile')
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your account</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>{user.role}</dd>
        </dl>
      </CardContent>
    </Card>
  )
}
