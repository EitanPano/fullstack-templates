import { Outlet } from 'react-router'

import { AppShell } from '@/shared/ui/pattern/app-shell'
import { UserMenu } from '@/shared/ui/pattern/user-menu' // @noserver:auth
import { AccountMenu } from '@/widget/account-menu/ui/account-menu' // @server:auth

import { NAV } from '../nav'

// The shell's account slot. With the server's auth it is the account widget (it reads the session
// and renders a skeleton while it loads); without, the theme menu alone.
// @server:auth-start
const account = <AccountMenu />
// @server:auth-end
// @noserver:auth-start
const account = <UserMenu />
// @noserver:auth-end

// The site frame: header with the nav table and the account slot, the page's one `main`, footer.
export default function SiteLayout() {
  return (
    <AppShell name="__PROJECT_DISPLAY_NAME__" nav={NAV} account={account}>
      <Outlet />
    </AppShell>
  )
}
