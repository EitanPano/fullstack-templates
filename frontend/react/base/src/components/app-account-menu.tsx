import { LogOutIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { SIGN_IN_PATH } from '@/core/config/constants'
import { AppUserMenu } from '@/components/app-user-menu'
import { initials } from '@/models/user'
import { api } from '@/services/api'
import { useLogoutMutation } from '@/services/auth.api'
import { useGetMeQuery } from '@/services/user.api'
import { Button } from '@/shared/components/button'
import { DropdownMenuItem } from '@/shared/components/dropdown-menu'
import { Skeleton } from '@/shared/components/skeleton'
import { useAppDispatch } from '@/store/hooks'
import './app-account-menu.scss'

// The size of the avatar trigger, so the header does not shift when the account arrives. It
// carries no role: the page's own status regions stay the only ones announced.
function AccountMenuSkeleton() {
  return <Skeleton className="account-menu__skeleton" />
}

// Sign-out asks the API to revoke the session (the mutation also drops the hint), then forgets
// everything this browser cached about the account whatever the API said, and only then goes to
// sign-in. A visitor who asked to sign out is signed out here even if the server session lives on
// until it expires; when the API could not be reached, they are told so.
const NOT_REVOKED_COPY =
  'Signed out here. The server could not be reached, so the session may still be open elsewhere.'

function SignOutItem() {
  const [logout] = useLogoutMutation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  return (
    <DropdownMenuItem
      onSelect={() => {
        void logout()
          .unwrap()
          .then(async ({ revoked }) => {
            if (!revoked) toast.warning(NOT_REVOKED_COPY)
            dispatch(api.util.resetApiState())
            await navigate(SIGN_IN_PATH)
          })
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
