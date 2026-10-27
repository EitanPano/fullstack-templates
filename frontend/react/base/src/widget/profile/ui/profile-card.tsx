import { useSuspenseQuery } from '@tanstack/react-query'

import { currentUserQuery } from '@/entity/user/api/user'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'

// The guarded-page example: the route's loader calls `requireAccount` (a visitor goes to sign-in
// with this page's path, and sign-in brings them back), which also fills the query this widget
// suspends on.
export function ProfileCard() {
  const { data: user } = useSuspenseQuery(currentUserQuery())
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
