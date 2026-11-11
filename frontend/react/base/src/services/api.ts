import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

import type { ApiError } from '@/models/api-error/type'

// A query whose last answer was a failure is fetched again by the next `initiate()`, even if an
// earlier answer is still inside the 30 s window: RTK Query keeps the old `fulfilledTimeStamp`
// across a rejected refetch, so without this a loader would rethrow the cached error and "Try
// again" could not refetch. Endpoints opt in with `forceRefetch`.
export const refetchIfRejected = ({ endpointState }: { endpointState?: { status: string } }) =>
  endpointState?.status === 'rejected'

// The one RTK Query API; each server module injects its endpoints (services/<module>.api.ts).
// The base query is fake because every endpoint runs the generated SDK through `call`. A read is
// refetched on mount only when its data is older than 30 s, the staleness the SPA always had.
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fakeBaseQuery<ApiError>(),
  tagTypes: [
    'User', // @server:auth
  ],
  endpoints: () => ({}),
  refetchOnMountOrArgChange: 30,
})
