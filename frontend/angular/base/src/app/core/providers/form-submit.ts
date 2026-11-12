import { inject, signal, type Signal } from '@angular/core'
import type { AbstractControl } from '@angular/forms'

import { DROPPED } from '@app/models/api/constant'
import type { Outcome } from '@app/models/api/type'
import { applyFieldErrors } from '@app/shared/validators/server-errors'

import { NotificationService } from './notification.service'

export interface FormSubmit {
  // True from the call until its outcome; bind it to `app-form-actions [pending]`.
  readonly pending: Signal<boolean>
  run<T>(call: () => Promise<Outcome<T>>): Promise<Outcome<T>>
}

// The one submit of a form page. It sends nothing for an invalid form or while a submit is
// pending, awaits the store method, and puts a server `validation_failed` on the fields, with one
// `errors.validation_failed` toast only for the paths no field shows. Every other failure was
// toasted by the store. Call it in an injection context, beside the form:
// `protected readonly submission = injectFormSubmit(this.form)`.
export function injectFormSubmit(form: AbstractControl): FormSubmit {
  const notifications = inject(NotificationService)
  const pending = signal(false)

  return {
    pending: pending.asReadonly(),
    async run<T>(call: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
      if (form.invalid || pending()) return DROPPED
      pending.set(true)
      try {
        const outcome = await call()
        if (!outcome.ok && outcome.error?.code === 'validation_failed') {
          const unmapped = applyFieldErrors(form, outcome.error)
          if (unmapped.length > 0 || !outcome.error.fieldErrors) {
            notifications.showError('errors.validation_failed')
          }
        }
        return outcome
      } finally {
        pending.set(false)
      }
    },
  }
}
