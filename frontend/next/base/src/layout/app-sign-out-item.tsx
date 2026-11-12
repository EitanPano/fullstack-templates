'use client'

import { signOut } from '@/actions/auth/auth'
import { DropdownMenuItem } from '@/shared/components/dropdown-menu/dropdown-menu'
import { useServerAction } from '@/shared/components/form/action-form/action-form'
import { LogOutIcon } from '@/shared/components/icons'

// A menu item for the AppUserMenu's items slot. The action clears the cookies and redirects.
export function AppSignOutItem() {
  const { execute } = useServerAction(signOut)
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
