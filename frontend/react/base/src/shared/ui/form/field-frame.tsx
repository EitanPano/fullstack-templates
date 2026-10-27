import type { ReactNode } from 'react'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field'

// The label, control slot, description and error of one field. The error is `role="alert"` and
// sits under the control it belongs to; the toast never repeats it.
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
    <Field data-invalid={message ? true : undefined} orientation={orientation}>
      {horizontal ? children : null}
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {horizontal ? null : children}
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      {message ? <FieldError id={errorId}>{message}</FieldError> : null}
    </Field>
  )
}
