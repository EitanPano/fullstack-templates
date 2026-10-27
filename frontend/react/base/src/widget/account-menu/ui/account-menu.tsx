import { Link } from 'react-router'

import { useCurrentUser } from '@/entity/user/api/user'
import { initials } from '@/entity/user/model'
import { SignOutItem } from '@/feature/auth/ui/sign-out-item'
import { Button } from '@/shared/ui/button'
import { UserMenu } from '@/shared/ui/pattern/user-menu'

import { AccountMenuSkeleton } from './account-menu-skeleton'

// The shell's account slot with an account behind it: a sign-in link and the theme menu for a
// visitor; the avatar menu (email, theme, sign out) for an account. The email lives in the menu,
// never as header text beside a primary button.
export function AccountMenu() {
  const { user, isPending } = useCurrentUser()
  if (isPending) return <AccountMenuSkeleton />
  if (!user) {
    return (
      <>
        <Button asChild variant="outline" size="sm">
          <Link to="/sign-in">Sign in</Link>
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
