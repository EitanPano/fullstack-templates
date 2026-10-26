'use client'

import { UserIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

import { ThemeToggle } from './theme-toggle'

// An avatar trigger with an items slot above the theme choices. Without auth, or for a visitor,
// the slot is empty and the menu is the theme menu. An account passes its email (shown as the
// first line of the menu, never in the header) and its items, such as Sign out.
export function UserMenu({
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
          className="rounded-full"
          aria-label={initials ? `Account menu, ${initials}` : 'Account menu'}
        >
          <Avatar size="sm">
            <AvatarFallback>
              {initials ?? <UserIcon aria-hidden className="size-4" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {email ? (
          <>
            <DropdownMenuLabel className="max-w-64 truncate font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {children ? (
          <>
            {children}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <ThemeToggle />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
