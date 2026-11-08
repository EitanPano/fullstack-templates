import type { ApiError } from '@/models/api/response'

import type { FieldError } from './zod-form'

// What applyFieldErrors needs of a form: the object `useZodForm` returns satisfies it.
type ServerErrorTarget = {
  values: Record<string, unknown>
  serverErrors: Record<string, FieldError>
  touch: (name: string) => void
}

// Puts a validation failure of the server onto the form. `error.fieldErrors` maps a path
// (`email`, no `body.` prefix) to codes; each path that names a field gets `errors.invalid`, never
// the server text, and is touched so the field shows it. The paths that name no field are
// returned: the page toasts `errors.validation_failed` once for them and never toasts a field
// that already shows its error. The error clears when the field is edited.
export function applyFieldErrors(form: ServerErrorTarget, error: ApiError): string[] {
  const unmapped: string[] = []
  for (const path of Object.keys(error.fieldErrors ?? {})) {
    if (Object.hasOwn(form.values, path)) {
      form.serverErrors[path] = { messageKey: 'errors.invalid' }
      form.touch(path)
    } else {
      unmapped.push(path)
    }
  }
  return unmapped
}
