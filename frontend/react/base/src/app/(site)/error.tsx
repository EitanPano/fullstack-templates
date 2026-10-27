import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useRevalidator, useRouteError } from 'react-router'

import { ErrorState } from '@/shared/ui/pattern/error-state'

// The ErrorBoundary of every route in the group, rendered inside the shell. The message is
// user-safe; the cause goes to the console. Retrying drops the failed queries and re-runs the
// route's loaders.
export default function SiteError() {
  const error = useRouteError()
  const { revalidate } = useRevalidator()
  const queryClient = useQueryClient()

  useEffect(() => {
    console.error('route failed', error)
  }, [error])

  return (
    <ErrorState
      title="Something went wrong"
      description="The page could not be loaded. Try again, or refresh if the problem persists."
      onRetry={() => {
        void queryClient.resetQueries()
        void revalidate()
      }}
    />
  )
}
