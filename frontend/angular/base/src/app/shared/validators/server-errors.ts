import type { AbstractControl } from '@angular/forms'

// Puts a validation failure of the server onto the form. `error.fieldErrors` maps a dotted path
// (`email`, `items.1.label`, no `body.` prefix) to codes; each path that names a control gets a
// `server` error with our copy (`errors.invalid`, never the server text) and is marked touched
// so the field shows it. The paths that name no control are returned: the page toasts
// `errors.validation_failed` once for them, and never toasts a field that already shows its error. The
// error clears itself when the control is edited, because its own validators then run again.
export function applyFieldErrors(
  group: AbstractControl,
  error: { readonly fieldErrors?: Record<string, string[]> },
): string[] {
  const unmapped: string[] = []
  for (const path of Object.keys(error.fieldErrors ?? {})) {
    const control = group.get(path)
    if (!control || control === group) {
      unmapped.push(path)
      continue
    }
    control.setErrors({
      ...control.errors,
      server: { messageKey: 'errors.invalid' },
    })
    control.markAsTouched()
  }
  return unmapped
}
