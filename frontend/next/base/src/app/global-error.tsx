'use client'

import '@fontsource-variable/inter'
import '@/styles/themes/brand.css'
import '@/styles/styles.scss'

import { ErrorState } from '@/shared/components/error-state'
import './global-error.scss'

// Replaces the root layout when it fails, so it renders its own document and loads the global
// style tree itself. Keep it user-safe.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" data-density="__THEME_DENSITY__">
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
