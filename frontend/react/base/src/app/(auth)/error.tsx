import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useRevalidator, useRouteError } from 'react-router'

import { ErrorState } from '@/shared/ui/pattern/error-state'

// The ErrorBoundary of the sign-in and sign-up screens, inside the layout's `main`. The message
// is user-safe; the cause goes to the console.
export default function AuthError() {
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
