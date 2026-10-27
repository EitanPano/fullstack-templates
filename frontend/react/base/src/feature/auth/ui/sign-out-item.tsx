import { LogOutIcon } from 'lucide-react'
import { useNavigate } from 'react-router'

import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'

import { useSignOut } from '../api/auth'

// A menu item for the UserMenu's items slot. The hook clears the cache; the handler then sends
// the visitor to sign-in, after the await.
export function SignOutItem() {
  const signOut = useSignOut()
  const navigate = useNavigate()
  return (
    <DropdownMenuItem
      onSelect={() => {
        void signOut.mutateAsync().then(() => navigate('/sign-in'))
      }}
    >
      <LogOutIcon aria-hidden />
      Sign out
    </DropdownMenuItem>
  )
}
