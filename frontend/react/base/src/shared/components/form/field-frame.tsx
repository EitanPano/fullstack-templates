import type { ReactNode } from 'react'

import { Label } from '@/shared/components/label'
import { cn } from '@/shared/utils/cn'

// The label, control slot, description and error of one field. The error line always exists, so
// it is a live region that exists before its text and announces the message as it appears. It is
// collapsed by CSS while empty, not removed. The toast never repeats it.
export function FieldFrame({
  id,
  label,
  description,
  descriptionId,
  message,
  errorId,
  orientation,
  children,
}: {
  id: string
  label: string
  description?: string
  descriptionId: string
  message?: string
  errorId: string
  orientation?: 'vertical' | 'horizontal'
  children: ReactNode
}) {
  const horizontal = orientation === 'horizontal'
  return (
    <div
      className={cn('form-field', horizontal && 'form-field--inline')}
      data-invalid={message ? true : undefined}
    >
      {horizontal ? children : null}
      <Label htmlFor={id}>{label}</Label>
      {horizontal ? null : children}
      {description ? (
        <p id={descriptionId} className="form-field__hint">
          {description}
        </p>
      ) : null}
      <p id={errorId} className="form-field__error" role="alert">
        {message}
      </p>
    </div>
  )
}
