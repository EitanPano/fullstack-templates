'use client'

import { LogOutIcon } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'

import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'

import { signOut } from '@/actions/auth'

// A menu item for the AppUserMenu's items slot. The action clears the cookies and redirects.
export function AppSignOutItem() {
  const { execute } = useAction(signOut)
  return (
    <DropdownMenuItem
      onSelect={() => {
        execute()
      }}
    >
      <LogOutIcon aria-hidden />
      Sign out
    </DropdownMenuItem>
  )
}
