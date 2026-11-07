import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

import type { ApiError } from '@/models/api-error'

// The one RTK Query API; each server module injects its endpoints (services/<module>.api.ts).
// The base query is fake because every endpoint runs the generated SDK through `call`. A read is
// refetched on mount only when its data is older than 30 s, the staleness the SPA always had.
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fakeBaseQuery<ApiError>(),
  tagTypes: [
    'Health',
    'User', // @server:auth
  ],
  endpoints: () => ({}),
  refetchOnMountOrArgChange: 30,
})
