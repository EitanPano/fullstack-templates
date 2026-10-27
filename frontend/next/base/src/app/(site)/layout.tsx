import { Suspense } from 'react' // @server:auth
import type { ReactNode } from 'react'

import { AppShell } from '@/shared/ui/pattern/app-shell'
import { UserMenu } from '@/shared/ui/pattern/user-menu' // @noserver:auth
import { AccountMenu } from '@/widget/account-menu/ui/account-menu' // @server:auth
import { AccountMenuSkeleton } from '@/widget/account-menu/ui/account-menu-skeleton' // @server:auth

import { NAV } from '../nav'

// The shell's account slot. With the server's auth it is the account widget, a request-time hole
// inside Suspense (it reads the session); without, the theme menu alone.
// @server:auth-start
const account = (
  <Suspense fallback={<AccountMenuSkeleton />}>
    <AccountMenu />
  </Suspense>
)
// @server:auth-end
// @noserver:auth-start
const account = <UserMenu />
// @noserver:auth-end

// The site frame: header with the nav table and the account slot, the page's one `main`, footer.
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AppShell name="__PROJECT_DISPLAY_NAME__" nav={NAV} account={account}>
      {children}
    </AppShell>
  )
}
