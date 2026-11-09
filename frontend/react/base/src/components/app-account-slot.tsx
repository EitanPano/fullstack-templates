import { AccountMenu } from '@/layout/components/account-menu' // @server:auth
import { UserMenu } from '@/layout/components/user-menu' // @noserver:auth

// The one place the two modes meet: an account menu when the server has auth, the theme menu
// alone when it has not. The generator keeps one of the two lines; in place both exist, and the
// second return is dead code on purpose.
export function AccountSlot() {
  return <AccountMenu /> // @server:auth
  return <UserMenu /> // @noserver:auth
}
