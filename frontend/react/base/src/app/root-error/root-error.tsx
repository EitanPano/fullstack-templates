import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import './root-error.scss'

// Last-resort boundary for what no group caught: a whole page, because the layout it would sit
// in has failed. Keep the message user-safe: no stack, no internal URL. The cause goes to the
// console, as in the group boundaries.
export default function RootError() {
  const error = useRouteError()

  useEffect(() => {
    console.error('app: render failed', error)
  }, [error])

  return (
    <main className="root-error">
      <h1 className="root-error__title">Something went wrong</h1>
      <p>The app could not be shown. Reload the page, or try again later.</p>
    </main>
  )
}
