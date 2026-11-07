import { clearSessionHint, setSessionHint } from '@/core/auth/session-hint'
import type { User } from '@/models/user'
import { api } from '@/services/api'
import { call } from '@/services/call'
import {
  postApiAuthLogin,
  postApiAuthLogout,
  postApiAuthRegister,
} from '@/services/generated/sdk.gen'
import { userApi } from '@/services/user.api'

export type Credentials = { email: string; password: string }

// Sign-in and sign-up resolve to the account only: the API also returns the tokens in the body
// (it sets them as HttpOnly cookies too), and the store must never hold them. The error is the
// default copy; the form words it for its own situation (`withCopy`).
// The cache writes of a success happen inside `queryFn`, before it returns, so every `unwrap()`
// caller sees them: the next loader (the page the visitor was sent back to) must find the account
// and not the visitor an earlier guard cached. `onQueryStarted` would run after the caller.
function signedIn(name: 'login' | 'register') {
  return async (
    body: Credentials,
    {
      dispatch,
    }: { dispatch: (action: ReturnType<typeof userApi.util.upsertQueryData>) => unknown },
  ) => {
    const result = await call(
      name === 'login' ? postApiAuthLogin({ body }) : postApiAuthRegister({ body }),
    )
    if ('error' in result) return result
    setSessionHint()
    await dispatch(userApi.util.upsertQueryData('getMe', undefined, result.data.user))
    return { data: result.data.user }
  }
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<User, Credentials>({ queryFn: signedIn('login') }),
    register: build.mutation<User, Credentials>({ queryFn: signedIn('register') }),
    // Revokes the session at the API and forgets the hint whatever the API said: a visitor who
    // asked to sign out is signed out here even if the server session lives on until it expires.
    // The caller resets the API state after the await: a reset inside the running mutation aborts
    // the request that is still settling.
    // `revoked` is false when the API call failed, so the caller can say the session may live on.
    logout: build.mutation<{ revoked: boolean }, void>({
      queryFn: async () => {
        const result = await call(postApiAuthLogout({ body: {} }))
        const revoked = !('error' in result)
        if (!revoked) {
          console.error('[auth] sign-out could not revoke the session', result.error)
        }
        clearSessionHint()
        return { data: { revoked } }
      },
    }),
  }),
})

export const { useLoginMutation, useRegisterMutation, useLogoutMutation } = authApi
