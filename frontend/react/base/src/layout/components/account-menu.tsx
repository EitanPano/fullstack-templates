import { LogOutIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { SIGN_IN_PATH } from '@/core/config/constants'
import { UserMenu } from '@/layout/components/user-menu'
import { initials } from '@/models/user'
import { useLogoutMutation } from '@/services/auth.api'
import { useGetMeQuery } from '@/services/user.api'
import { Button } from '@/shared/components/button'
import { DropdownMenuItem } from '@/shared/components/dropdown-menu'
import { Skeleton } from '@/shared/components/skeleton'

// The size of the avatar trigger, so the header does not shift when the account arrives. It
// carries no role: the page's own status regions stay the only ones announced.
function AccountMenuSkeleton() {
  return <Skeleton className="account-menu__skeleton" />
}

// Sign-out revokes the session and clears the cache whatever the API said; this handler then
// sends the visitor to sign-in, after the await.
function SignOutItem() {
  const [logout] = useLogoutMutation()
  const navigate = useNavigate()
  return (
    <DropdownMenuItem
      onSelect={() => {
        void logout()
          .unwrap()
          .then(() => navigate(SIGN_IN_PATH))
      }}
    >
      <LogOutIcon aria-hidden="true" className="icon" />
      Sign out
    </DropdownMenuItem>
  )
}

// The shell's account slot with an account behind it: a sign-in link and the theme menu for a
// visitor; the avatar menu (email, theme, sign out) for an account. The email lives in the menu,
// never as header text beside a primary button.
export function AccountMenu() {
  const { data: user, isLoading, isError } = useGetMeQuery()
  if (isLoading) return <AccountMenuSkeleton />
  if (isError || user === null || user === undefined) {
    return (
      <>
        <Button asChild variant="secondary" size="sm">
          <Link to={SIGN_IN_PATH}>Sign in</Link>
        </Button>
        <UserMenu />
      </>
    )
  }
  return (
    <UserMenu email={user.email} initials={initials(user)}>
      <SignOutItem />
    </UserMenu>
  )
}
