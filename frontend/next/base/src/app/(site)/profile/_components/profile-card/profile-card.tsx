import { requireAccount } from '@/core/auth/session'
import { getProfile } from '@/services/user'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/card/card'
import './profile-card.scss'

// The guarded-page example: `requireAccount` sends a visitor to sign-in with this page's path,
// and sign-in brings them back. The account then comes from `services/user.ts`; the card is a
// request-time hole, so its page wraps it in Suspense and the shell stays prerendered.
export async function ProfileCard() {
  const { accessToken } = await requireAccount('/profile')
  const user = await getProfile(accessToken)
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
