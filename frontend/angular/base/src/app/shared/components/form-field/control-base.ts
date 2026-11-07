import { computed, inject, signal, type WritableSignal } from '@angular/core'
import type { ControlValueAccessor } from '@angular/forms'

import { uniqueId } from '../../utils/unique-id'
import { FORM_FIELD } from './form-field.token'

// What every form control shares: the ControlValueAccessor plumbing (value and disabled as signals)
// and the field wiring (id, aria-invalid, aria-describedby). A control extends it, calls `commit`
// when the user changes the value and `touch` on blur, and binds `controlId`, `invalid` and
// `describedBy` in its template.
export abstract class ControlBase<T> implements ControlValueAccessor {
  private readonly field = inject(FORM_FIELD, { optional: true })
  private readonly ownId = uniqueId('control')
  private onChange: (value: T) => void = () => undefined
  private onTouched: () => void = () => undefined

  protected readonly value: WritableSignal<T>
  protected readonly disabled = signal(false)

  protected readonly controlId = this.field?.id ?? this.ownId
  protected readonly invalid = computed(() => this.field?.invalid() ?? false)
  protected readonly describedBy = computed(() => this.field?.describedBy() ?? null)

  protected constructor(empty: T) {
    this.value = signal<T>(empty)
  }

  writeValue(value: T | null): void {
    this.value.set(this.fromModel(value))
  }

  registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled)
  }

  // The model's value to what the control shows; null (a reset form) becomes the empty value.
  protected abstract fromModel(value: T | null): T

  protected commit(value: T): void {
    this.value.set(value)
    this.onChange(value)
  }

  protected touch(): void {
    this.onTouched()
  }
}
