'use client'

import { ErrorState } from '@/shared/components/error-state'
import './global-error.scss'

// Replaces the root layout when it fails, so it renders its own document. Keep it user-safe.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="global-error">
          <ErrorState
            title="Something went wrong"
            description="The app could not be loaded. Try again, or refresh if the problem persists."
            onRetry={reset}
          />
        </main>
      </body>
    </html>
  )
}
