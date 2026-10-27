'use client'

import { ErrorState } from '@/shared/ui/pattern/error-state'

// Error boundaries must be Client Components. Keep the message user-safe; the cause is in
// the server log under its request id.
export default function AuthError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong"
      description="The page could not be loaded. Try again, or refresh if the problem persists."
      onRetry={reset}
    />
  )
}
