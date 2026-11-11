import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { SIGN_IN_PATH } from '@/core/config/constants'
import { api } from '@/services/api'
import { useLogoutMutation } from '@/services/auth.api'
import { useAppDispatch } from '@/store/hooks'

// Sign-out asks the API to revoke the session (the mutation also drops the hint), then forgets
// everything this browser cached about the account whatever the API said, and only then goes to
// sign-in. A visitor who asked to sign out is signed out here even if the server session lives on
// until it expires; when the API could not be reached, they are told so.
const NOT_REVOKED_COPY =
  'Signed out here. The server could not be reached, so the session may still be open elsewhere.'

// The one sign-out action: the profile page's button and the account menu's item both run it.
export function useSignOut() {
  const [logout] = useLogoutMutation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  return () => {
    void logout()
      .unwrap()
      .then(async ({ revoked }) => {
        if (!revoked) toast.warning(NOT_REVOKED_COPY)
        dispatch(api.util.resetApiState())
        await navigate(SIGN_IN_PATH)
      })
  }
}
