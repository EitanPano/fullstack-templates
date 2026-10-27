'use client'

import { LogOutIcon } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'

import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'

import { signOut } from '../server/action'

// A menu item for the UserMenu's items slot. The action clears the cookies and redirects.
export function SignOutItem() {
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
