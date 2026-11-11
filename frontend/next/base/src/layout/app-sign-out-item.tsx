'use client'

import { LogOutIcon } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'

import { signOut } from '@/actions/auth'
import { DropdownMenuItem } from '@/shared/components/dropdown-menu/dropdown-menu'

// A menu item for the AppUserMenu's items slot. The action clears the cookies and redirects.
export function AppSignOutItem() {
  const { execute } = useAction(signOut)
  return (
    <DropdownMenuItem
      onSelect={() => {
        execute()
      }}
    >
      <LogOutIcon aria-hidden="true" className="icon" />
      Sign out
    </DropdownMenuItem>
  )
}
