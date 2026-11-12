'use client'

import { signOut } from '@/actions/auth/auth'
import { Button } from '@/shared/components/button/button'
import { useServerAction } from '@/shared/components/form/action-form/action-form'

// The profile page's Sign out: the same action as the menu item. It clears the cookies and
// redirects to sign-in.
export function SignOutButton() {
  const { execute } = useServerAction(signOut)
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
