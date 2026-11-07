import { useEffect } from 'react'
import { useRevalidator, useRouteError } from 'react-router'

import { isApiError } from '@/models/api-error'
import { Button } from '@/shared/components/button'

// The group's ErrorBoundary: it renders inside the shell. An ApiError already carries user-safe
// copy; anything else gets a generic line and the cause goes to the console. Retry only
// revalidates: a rejected cache entry with no subscriber is fetched again by the loader.
export function MainError() {
  const error = useRouteError()
  const revalidator = useRevalidator()

  useEffect(() => {
    console.error('app: route failed', error)
  }, [error])

  const message = isApiError(error) ? error.message : 'Something went wrong. Try again.'
  return (
    <section role="alert" className="error-state">
      <h1 className="error-state__title">Something went wrong</h1>
      <p>{message}</p>
      <Button
        variant="secondary"
        disabled={revalidator.state === 'loading'}
        onClick={() => void revalidator.revalidate()}
      >
        Retry
      </Button>
    </section>
  )
}
