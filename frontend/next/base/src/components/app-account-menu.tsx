import Link from 'next/link'

import { initials } from '@/models/user'
import { getCurrentUser } from '@/services/user'
import { AppSignOutItem } from './app-sign-out-item'
import { Button } from '@/shared/ui/button'
import { AppUserMenu } from '@/components/app-user-menu'

// The account menu a product places in its header, with an account behind it: a sign-in link and the theme menu for a
// visitor; the avatar menu (email, theme, sign out) for an account. The email lives in the menu,
// never as header text beside a primary button.
export async function AppAccountMenu() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <>
        <Button asChild variant="outline" size="sm">
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
