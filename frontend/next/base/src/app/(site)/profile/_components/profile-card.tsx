import { requireAccount } from '@/core/auth/session'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/card'
import './profile-card.scss'

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
        <dl className="profile__facts">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
        </dl>
      </CardContent>
    </Card>
  )
}
