import { InjectionToken, type Signal } from '@angular/core'

// What `app-form-field` hands down to the control projected into it. A control (`app-input`,
// `app-select`, ...) injects it optionally: inside a field it takes the field's id (so the label's
// `for` matches) and sets `aria-invalid` and `aria-describedby` from the signals; outside a field
// it uses its own id and sets neither.
export interface FormFieldContext {
  readonly id: string
  // True once the control is invalid AND touched (or its form was submitted).
  readonly invalid: Signal<boolean>
  // The ids of the hint and the visible error, space separated; null when there are none.
  readonly describedBy: Signal<string | null>
}

export const FORM_FIELD = new InjectionToken<FormFieldContext>('FORM_FIELD')
