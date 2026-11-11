import { Button } from '@/shared/components/button'
import { useSignOut } from '@/store/use-sign-out'

// The profile page's Sign out: the same action as the account menu's item.
export function SignOutButton() {
  const signOut = useSignOut()
  return (
    <Button variant="secondary" onClick={signOut}>
      Sign out
    </Button>
  )
}
