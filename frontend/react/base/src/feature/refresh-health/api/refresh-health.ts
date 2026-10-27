import { useMutation, useQueryClient } from '@tanstack/react-query'

import { healthKey } from '@/entity/health/api/health'
import { call } from '@/shared/api/call'
import { getApiHealth } from '@/shared/api/generated'

// A mutation hook: call the API, then invalidate the keys the read lives under, so the widget
// shows the new value. An uncached ping first is the point of the action; invalidating while the
// API is down would only swap one error for another.
export function useRefreshHealth() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => call(getApiHealth()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: healthKey() }),
  })
}
