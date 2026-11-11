'use client'

import { useAction } from 'next-safe-action/hooks'

import { signOut } from '@/actions/auth'
import { Button } from '@/shared/components/button/button'

// The profile page's Sign out: the same action as the menu item. It clears the cookies and
// redirects to sign-in.
export function SignOutButton() {
  const { execute } = useAction(signOut)
  return (
    <Button
      variant="secondary"
      onClick={() => {
        execute()
      }}
    >
      Sign out
    </Button>
  )
}
