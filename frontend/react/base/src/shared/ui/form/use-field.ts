import { useId } from 'react'
import { get, useFormContext } from 'react-hook-form'

import '@/shared/lib/zod-messages'

// What every field binding needs of the form: a stable id, the error message for its name
// (nested names like `address.city` work), and the ids that tie the control to its description
// and its error. The form is read from context, so a field is `name` plus presentation.
export function useField(name: string, hasDescription: boolean) {
  const id = useId()
  const {
    formState: { errors },
  } = useFormContext()
  const message = (get(errors, name) as { message?: string } | undefined)?.message
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  const own = [hasDescription ? descriptionId : undefined, message ? errorId : undefined]
  return {
    id,
    message,
    descriptionId,
    errorId,
    // Spread onto the control AFTER the caller's props: marks it invalid and points at the
    // description and the error, keeping any `aria-describedby` the caller passed.
    aria: (callerDescribedBy?: string) => ({
      'aria-invalid': message ? (true as const) : undefined,
      'aria-describedby': [callerDescribedBy, ...own].filter(Boolean).join(' ') || undefined,
    }),
  }
}
