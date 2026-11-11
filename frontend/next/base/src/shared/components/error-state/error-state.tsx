'use client'

import { TriangleAlertIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/alert/alert'
import { Button } from '@/shared/components/button/button'
import './error-state.scss'

// A user-safe failure with an optional retry. Keep `description` free of causes: those go to the
// console under the route boundary that caught them. `retrying` disables the button while the
// retry runs.
export function ErrorState({
  title,
  description,
  onRetry,
  retrying = false,
}: {
  title: string
  description?: string
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <Alert variant="destructive" className="error-state">
      <TriangleAlertIcon aria-hidden="true" className="icon" />
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
      {onRetry ? (
        <div className="alert__actions">
          <Button variant="secondary" size="sm" disabled={retrying} onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </Alert>
  )
}
