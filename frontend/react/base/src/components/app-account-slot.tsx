import { AppAccountMenu } from '@/components/app-account-menu' // @server:auth
import { AppUserMenu } from '@/components/app-user-menu' // @noserver:auth

// The one place the two modes meet: an account menu when the server has auth, the theme menu
// alone when it has not. The generator keeps one of the two lines; in place both exist, and the
// second return is dead code on purpose.
export function AppAccountSlot() {
  return <AppAccountMenu /> // @server:auth
  return <AppUserMenu /> // @noserver:auth
}
