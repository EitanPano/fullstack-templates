import { useEffect } from 'react'
import { useRevalidator, useRouteError } from 'react-router'

import { isApiError } from '@/models/api-error'
import { ErrorState } from '@/shared/components/error-state'
import { Page } from '@/shared/components/page'

// The group ErrorBoundary: it renders inside main. An ApiError already carries user-safe
// copy; anything else gets a generic line and the cause goes to the console. Retry only
// revalidates: a rejected cache entry with no subscriber is fetched again by the loader.
export function AppMainError() {
  const error = useRouteError()
  const revalidator = useRevalidator()

  useEffect(() => {
    console.error('app: route failed', error)
  }, [error])

  return (
    <Page>
      <ErrorState
        title="Something went wrong"
        description={isApiError(error) ? error.message : 'Something went wrong. Try again.'}
        retrying={revalidator.state === 'loading'}
        onRetry={() => void revalidator.revalidate()}
      />
    </Page>
  )
}
