import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms'

// A group validator for a confirm field: `match('password', 'confirm')` puts a `match` error on
// the second control while its value differs from the first, and clears it when they agree. It
// works on the control so `app-form-field` shows `errors.match` beside the confirm field, and it
// re-runs when either control changes because it sits on the group.
export function match(name: string, confirmName: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const confirm = group.get(confirmName)
    if (!confirm) return null
    const equal = group.get(name)?.value === confirm.value
    const { match: _previous, ...others } = confirm.errors ?? {}
    const errors = equal ? others : { ...others, match: true }
    confirm.setErrors(Object.keys(errors).length > 0 ? errors : null, { emitEvent: false })
    return null
  }
}
