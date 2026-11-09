import { computed, inject, type ComputedRef, type InjectionKey } from 'vue'

import { useUniqueId } from '@/shared/composables/use-unique-id'

// What a form-field hands down to the control inside it. A control (base-input, base-select, ...)
// reads it optionally: inside a field it takes the field id (so the label for matches) and sets
// aria-invalid and aria-describedby from it; outside a field it uses an id of its own and sets
// neither.
export type FormFieldContext = {
  readonly id: string
  // True while the field shows an error.
  readonly invalid: ComputedRef<boolean>
  // The ids of the hint and the visible error, space separated; undefined when there are none.
  readonly describedBy: ComputedRef<string | undefined>
}

export const FORM_FIELD_KEY: InjectionKey<FormFieldContext> = Symbol('form-field')

// The id and the aria wiring of a control: the field when there is one, itself otherwise. Call it
// in setup.
export function useFieldControl() {
  const field = inject(FORM_FIELD_KEY, null)
  const ownId = useUniqueId('control')
  return {
    controlId: field?.id ?? ownId,
    invalid: computed(() => field?.invalid.value ?? false),
    describedBy: computed(() => field?.describedBy.value),
  }
}
