import { useMutation, useQueryClient } from '@tanstack/react-query'

import { call } from '@/shared/api/call'
import { postApiAuthLogin, postApiAuthLogout, postApiAuthRegister } from '@/shared/api/generated'
import { getApiUserMeQueryKey } from '@/shared/api/generated/@tanstack/react-query.gen'
import { clearSessionHint, setSessionHint } from '@/shared/api/session-hint'

import { SIGN_IN_COPY, SIGN_UP_COPY, type SignInInput, type SignUpInput } from '../model'

// Mutation hooks. The API sets the HttpOnly session cookies itself (same origin), so nothing here
// holds a token: a success only records who signed in. The form awaits `mutateAsync` and decides
// the outcome (navigate, toast) after the await.
export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: Pick<SignInInput, 'email' | 'password'>) =>
      call(postApiAuthLogin({ body: { email, password } }), SIGN_IN_COPY),
    onSuccess: (session) => {
      setSessionHint()
      queryClient.setQueryData(getApiUserMeQueryKey(), session.user)
    },
  })
}

export function useSignUp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: Pick<SignUpInput, 'email' | 'password'>) =>
      call(postApiAuthRegister({ body: { email, password } }), SIGN_UP_COPY, {
        fields: { conflict: 'email' },
      }),
    onSuccess: (session) => {
      setSessionHint()
      queryClient.setQueryData(getApiUserMeQueryKey(), session.user)
    },
  })
}

// Revokes the session at the API, then forgets everything this browser cached about the account
// whatever the API said: a visitor who asked to sign out is signed out here even if the server
// session lives on until it expires. The client refreshes first when only the refresh cookie is
// left, so the revoke still reaches the API.
export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        await call(postApiAuthLogout({ body: {} }))
      } catch (error) {
        console.error('[auth] sign-out could not revoke the session', error)
      }
    },
    onSettled: () => {
      clearSessionHint()
      queryClient.clear()
    },
  })
}
