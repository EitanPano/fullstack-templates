import type { User } from '@/models/user'
import { api } from '@/services/api'
import { call } from '@/services/call'
import { getApiUserMe } from '@/services/generated/sdk.gen'

// Who the cookies belong to. The session is this cache entry: there is no auth slice beside it.
// A visitor's 401 is not a failure: it resolves to `null` ("no account"), which RTK Query caches
// like any answer, so a visitor costs one request, not one per reader. Any other failure stays an
// ApiError.
export const userApi = api.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query<User | null, void>({
      queryFn: async () => {
        const result = await call(getApiUserMe())
        if ('error' in result && result.error.code === 'unauthenticated') return { data: null }
        return result
      },
      providesTags: ['User'],
    }),
  }),
})

export const { useGetMeQuery } = userApi
