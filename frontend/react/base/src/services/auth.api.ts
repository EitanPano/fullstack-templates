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
// The side effects of a success are `onQueryStarted`, RTK Query's place for them: remember the
// browser and write the account into the `getMe` cache, so the header flips without a request.
export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<User, Credentials>({
      queryFn: async (body) => {
        const result = await call(postApiAuthLogin({ body }))
        return 'error' in result ? result : { data: result.data.user }
      },
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled
          setSessionHint()
          await dispatch(userApi.util.upsertQueryData('getMe', undefined, data))
        } catch {
          // A failure is the caller's to show (it awaits the mutation); nothing to remember.
        }
      },
    }),
    register: build.mutation<User, Credentials>({
      queryFn: async (body) => {
        const result = await call(postApiAuthRegister({ body }))
        return 'error' in result ? result : { data: result.data.user }
      },
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled
          setSessionHint()
          await dispatch(userApi.util.upsertQueryData('getMe', undefined, data))
        } catch {
          // A failure is the caller's to show (it awaits the mutation); nothing to remember.
        }
      },
    }),
    // Revokes the session at the API, then forgets everything this browser cached about the
    // account whatever the API said: a visitor who asked to sign out is signed out here even if
    // the server session lives on until it expires.
    logout: build.mutation<void, void>({
      queryFn: async () => {
        const result = await call(postApiAuthLogout({ body: {} }))
        if ('error' in result) {
          console.error('[auth] sign-out could not revoke the session', result.error)
        }
        return { data: undefined }
      },
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled
        } finally {
          clearSessionHint()
          dispatch(api.util.resetApiState())
        }
      },
    }),
  }),
})

export const { useLoginMutation, useRegisterMutation, useLogoutMutation } = authApi
