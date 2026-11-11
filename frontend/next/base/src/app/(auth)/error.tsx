'use client'

import { ErrorState } from '@/shared/components/error-state'
import './error.scss'

// Error boundaries must be Client Components. Keep the message user-safe; the cause is in
// the server log under its request id.
export default function AuthError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="auth-error">
      <ErrorState
        title="Something went wrong"
        description="The page could not be loaded. Try again, or refresh if the problem persists."
        onRetry={reset}
      />
    </div>
  )
}
