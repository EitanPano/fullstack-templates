import Link from 'next/link'

import { initials } from '@/entity/user/model'
import { getCurrentUser } from '@/entity/user/server/user'
import { SignOutItem } from '@/feature/auth/ui/sign-out-item'
import { Button } from '@/shared/ui/button'
import { UserMenu } from '@/shared/ui/pattern/user-menu'

// The shell's account slot with an account behind it: a sign-in link and the theme menu for a
// visitor; the avatar menu (email, theme, sign out) for an account. The email lives in the menu,
// never as header text beside a primary button.
export async function AccountMenu() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <>
        <Button asChild variant="outline" size="sm">
          <Link href="/sign-in">Sign in</Link>
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
