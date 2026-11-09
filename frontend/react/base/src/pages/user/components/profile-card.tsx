import { isApiError } from '@/models/api-error'
import { useGetMeQuery } from '@/services/user.api'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/card'
import { ErrorState } from '@/shared/components/error-state'
import { CardSkeleton } from '@/shared/components/skeletons'

// The account behind the cookies. The route's guard has already filled the cache, so the card
// normally renders at once; the skeleton shows only when the entry was evicted.
export function ProfileCard() {
  const { data: user, error, isLoading, isFetching, refetch } = useGetMeQuery()

  if (isLoading) return <CardSkeleton />
  // `null` (no account) cannot happen behind requireAccount, but it is not an account.
  if (!user) {
    return (
      <ErrorState
        title="Can't load your account"
        description={isApiError(error) ? error.message : 'Something went wrong. Try again.'}
        retrying={isFetching}
        onRetry={() => void refetch()}
      />
    )
  }
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
