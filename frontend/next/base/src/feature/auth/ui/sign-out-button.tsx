'use client'

import { useAction } from 'next-safe-action/hooks'

import { Button } from '@/shared/ui/button'

import { signOut } from '../server/action'

// The profile page's Sign out: the same action as the menu item. It clears the cookies and
// redirects to sign-in.
export function SignOutButton() {
  const { execute } = useAction(signOut)
  return (
    <Button
      variant="outline"
      onClick={() => {
        execute()
      }}
    >
      Sign out
    </Button>
  )
}
