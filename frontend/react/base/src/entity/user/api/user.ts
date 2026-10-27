import { queryOptions, useQuery } from '@tanstack/react-query'

import { call } from '@/shared/api/call'
import { getApiUserMe } from '@/shared/api/generated'
import {
  getApiUserMeOptions,
  getApiUserMeQueryKey,
} from '@/shared/api/generated/@tanstack/react-query.gen'

import type { User } from '../model'

export const currentUserKey = () => getApiUserMeQueryKey()

export const currentUserQuery = () =>
  queryOptions({
    ...getApiUserMeOptions(),
    queryFn: ({ signal }): Promise<User> => call(getApiUserMe({ signal })),
  })

// The signed-in account, or null for a visitor (the API's 401) and while the read is pending.
// A per-user read: widgets that use it render a skeleton for `isPending`.
export function useCurrentUser() {
  const { data, isPending } = useQuery({ ...currentUserQuery(), retry: false })
  return { user: data ?? null, isPending }
}
