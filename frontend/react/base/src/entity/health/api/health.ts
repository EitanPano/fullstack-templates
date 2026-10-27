import { queryOptions } from '@tanstack/react-query'

import { call } from '@/shared/api/call'
import { getApiHealth } from '@/shared/api/generated'
import {
  getApiHealthOptions,
  getApiHealthQueryKey,
} from '@/shared/api/generated/@tanstack/react-query.gen'

// The health read as TanStack Query options. The generated options carry the query key; the
// query function goes through `call` so a failure is an ActionError with our copy, never the
// server's text. A route loader calls `queryClient.query(healthQuery())` (fetches when the data is older than
// the client's stale time), a widget
// `useSuspenseQuery(healthQuery())`, and a mutation invalidates `healthKey()`.
export const healthKey = () => getApiHealthQueryKey()

export const healthQuery = () =>
  queryOptions({
    ...getApiHealthOptions(),
    queryFn: ({ signal }) => call(getApiHealth({ signal })),
  })
