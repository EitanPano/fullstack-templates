import Link from 'next/link'

import { AppUserMenu } from '@/components/app-user-menu'
import { initials } from '@/models/user'
import { getCurrentUser } from '@/services/user'
import { Button } from '@/shared/components/button'
import { AppSignOutItem } from './app-sign-out-item'

// The account menu a product places in its header, with an account behind it: a sign-in link and
// the theme menu for a visitor; the avatar menu (email, theme, sign out) for an account. The email
// lives in the menu, never as header text beside a primary button.
export async function AppAccountMenu() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <>
        <Button asChild variant="secondary" size="sm">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <AppUserMenu />
      </>
    )
  }
  return (
    <AppUserMenu email={user.email} initials={initials(user)}>
      <AppSignOutItem />
    </AppUserMenu>
  )
}
