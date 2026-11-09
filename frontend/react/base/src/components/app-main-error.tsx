import { useEffect } from 'react'
import { useRevalidator, useRouteError } from 'react-router'

import { isApiError } from '@/models/api-error'
import { ErrorState } from '@/shared/components/error-state'

// The group ErrorBoundary: it renders inside the shell. An ApiError already carries user-safe
// copy; anything else gets a generic line and the cause goes to the console. Retry only
// revalidates: a rejected cache entry with no subscriber is fetched again by the loader.
export function MainError() {
  const error = useRouteError()
  const revalidator = useRevalidator()

  useEffect(() => {
    console.error('app: route failed', error)
  }, [error])

  return (
    <ErrorState
      title="Something went wrong"
      description={isApiError(error) ? error.message : 'Something went wrong. Try again.'}
      retrying={revalidator.state === 'loading'}
      onRetry={() => void revalidator.revalidate()}
    />
  )
}
