import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'

import { ActionError } from '@/shared/lib/action-error'

// What a form does with a failed mutation: an error that belongs to fields lands on them (our
// copy, from `call`), anything else is the outcome and gets a toast. Never both, so a toast never
// repeats a field error. Call it from the submit handler after the await, never from an effect.
// A path the form has no field for (a server-only or renamed field) would make an invisible
// error, so when none of the paths is a field of this form the message is toasted instead.
export function reportFailure<T extends FieldValues>(
  form: { setError: UseFormSetError<T>; getValues: () => unknown },
  error: unknown,
  description?: string,
): void {
  if (error instanceof ActionError && error.fieldErrors) {
    // A form's fields are the keys of its default values; a nested path starts with one of them.
    const known = Object.keys(form.getValues() as object)
    const shown = Object.entries(error.fieldErrors).filter(([path]) =>
      known.includes(path.split(/[.[]/)[0] ?? path),
    )
    if (shown.length > 0) {
      for (const [path, message] of shown) {
        form.setError(path as FieldPath<T>, { type: 'server', message })
      }
      return
    }
  }
  const message = error instanceof ActionError ? error.message : 'Something went wrong. Try again.'
  if (description === undefined) toast.error(message)
  else toast.error(message, { description })
}
