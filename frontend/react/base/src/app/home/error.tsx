import { useEffect } from 'react'
import { useRevalidator, useRouteError } from 'react-router'

import { Button } from '@/shared/ui/button'

// The route's ErrorBoundary. The message is user-safe; the cause goes to the console, where
// the browser's developer tools (and any error reporter added later) can read it.
export default function HomeError() {
  const error = useRouteError()
  const { revalidate } = useRevalidator()

  useEffect(() => {
    console.error('home: route failed', error)
  }, [error])

  return (
    <>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p role="alert">The page could not be loaded. Try again, or refresh if it persists.</p>
      <Button onClick={() => void revalidate()} className="w-fit">
        Try again
      </Button>
    </>
  )
}
