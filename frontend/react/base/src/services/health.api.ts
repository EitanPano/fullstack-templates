import type { HealthView } from '@/models/health'
import { api } from '@/services/api'
import { call } from '@/services/call'
import { getApiHealth } from '@/services/generated/sdk.gen'

// The liveness read. `Health` is the tag a refresh invalidates, so every subscribed widget
// refetches; the refresh is a mutation because it is a user action with an outcome to report.
export const healthApi = api.injectEndpoints({
  endpoints: (build) => ({
    getHealth: build.query<HealthView, void>({
      queryFn: () => call(getApiHealth()),
      providesTags: ['Health'],
    }),
    refreshHealth: build.mutation<HealthView, void>({
      queryFn: () => call(getApiHealth()),
      invalidatesTags: ['Health'],
    }),
  }),
})

export const { useGetHealthQuery, useRefreshHealthMutation } = healthApi
