import { UserIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { AppThemeMenu } from '@/components/app-theme-menu'
import { Avatar, AvatarFallback } from '@/shared/components/avatar'
import { Button } from '@/shared/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/dropdown-menu'
import './app-user-menu.scss'

// An avatar trigger with an items slot above the theme choices. Without an account the slot is
// empty and the menu is the theme menu. An account passes its email (the first line of the menu,
// never in the header) and its items, such as Sign out.
export function AppUserMenu({
  children,
  initials,
  email,
}: {
  children?: ReactNode
  initials?: string
  email?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="user-menu__trigger"
          // The visible initials must sit inside the accessible name (WCAG 2.5.3).
          aria-label={initials ? `Account menu, ${initials}` : 'Account menu'}
        >
          <Avatar size="sm">
            <AvatarFallback>
              {initials ?? <UserIcon aria-hidden="true" className="icon" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {email ? (
          <>
            <DropdownMenuLabel className="user-menu__email">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {children ? (
          <>
            {children}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <AppThemeMenu />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
