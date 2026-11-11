import { LogOutIcon } from 'lucide-react'
import { Link } from 'react-router'

import { SIGN_IN_PATH } from '@/core/config/constants'
import { AppUserMenu } from '@/components/app-user-menu'
import { initials } from '@/models/user'
import { useGetMeQuery } from '@/services/user.api'
import { Button } from '@/shared/components/button'
import { DropdownMenuItem } from '@/shared/components/dropdown-menu'
import { Skeleton } from '@/shared/components/skeleton'
import { useSignOut } from '@/store/use-sign-out'
import './app-account-menu.scss'

// The size of the avatar trigger, so the toolbar around it does not shift when the account
// arrives. It carries no role: the page's own status regions stay the only ones announced.
function AccountMenuSkeleton() {
  return <Skeleton className="account-menu__skeleton" />
}

function SignOutItem() {
  const signOut = useSignOut()
  return (
    <DropdownMenuItem onSelect={signOut}>
      <LogOutIcon aria-hidden="true" className="icon" />
      Sign out
    </DropdownMenuItem>
  )
}

// The account control a product places in its header (AGENTS.md › The shell): a sign-in link and
// the theme menu for a visitor; the avatar menu (email, theme, sign out) for an account. The email
// lives in the menu, never as header text beside a primary button.
export function AppAccountMenu() {
  const { data: user, isLoading, isError } = useGetMeQuery()
  if (isLoading) return <AccountMenuSkeleton />
  if (isError || user === null || user === undefined) {
    return (
      <>
        <Button asChild variant="secondary" size="sm">
          <Link to={SIGN_IN_PATH}>Sign in</Link>
        </Button>
        <AppUserMenu />
      </>
    )
  }
  return (
    <AppUserMenu email={user.email} initials={initials(user)}>
      <SignOutItem />
    </AppUserMenu>
  )
}
