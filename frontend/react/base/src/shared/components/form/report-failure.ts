import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'

import { isApiError } from '@/models/api-error'

// What a form does with a failed mutation: an error that belongs to fields lands on them (our
// copy, from `call`), anything else is the outcome and gets a toast. A message is never both, so a
// toast never repeats a field error. Call it from the submit handler after the await, never from
// an effect. A form's fields are the keys of its values, so every field needs a default value; a
// path the form has no field for (a server-only or renamed field) is toasted, with the paths that
// did land on fields left out.
export function reportFailure<T extends FieldValues>(
  form: { setError: UseFormSetError<T>; getValues: () => FieldValues },
  error: unknown,
  description?: string,
): void {
  const apiError = isApiError(error) ? error : undefined
  const unknown: string[] = []
  let shownCount = 0
  if (apiError?.fieldErrors) {
    const known = Object.keys(form.getValues())
    for (const [path, message] of Object.entries(apiError.fieldErrors)) {
      // A nested path (`address.city`, `items[0].name`) starts with one of the form's keys.
      if (known.includes(path.split(/[.[]/)[0] ?? path)) {
        // Only the first shown error takes focus, so the person lands on the first problem.
        form.setError(
          path as FieldPath<T>,
          { type: 'server', message },
          { shouldFocus: shownCount === 0 },
        )
        shownCount += 1
      } else {
        unknown.push(message)
      }
    }
    if (shownCount > 0 && unknown.length === 0) return
  }
  if (shownCount > 0) {
    // Some paths landed on fields; the rest have nowhere to show, so they share one toast.
    const text = unknown.join('\n')
    if (description === undefined) toast.error(text)
    else toast.error(text, { description })
    return
  }
  const message = apiError?.message ?? 'Something went wrong. Try again.'
  if (description === undefined) toast.error(message)
  else toast.error(message, { description })
}
