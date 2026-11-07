import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'

import { TranslatePipe } from '../../pipes/translate.pipe'
import { ButtonComponent } from '../button/button.component'
import { ControlBase } from '../form-field/control-base'
import { IconComponent } from '../icon/icon.component'

export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search'
export type InputMode = 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'

// A text-like <input> bound with `formControlName`. A `number` input holds a number (null when
// empty); every other type holds a string. A `password` input has a show/hide toggle. Inside an
// `app-form-field` it takes the field's id and aria wiring. `placeholder` arrives translated.
@Component({
  selector: 'app-input',
  imports: [ButtonComponent, IconComponent, TranslatePipe],
  templateUrl: './input.component.html',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => InputComponent), multi: true },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputComponent extends ControlBase<string | number | null> {
  readonly type = input<InputType>('text')
  readonly autocomplete = input<string | null>(null)
  readonly inputmode = input<InputMode | null>(null)
  readonly placeholder = input<string | null>(null)
  readonly readonly = input(false)

  protected readonly revealed = signal(false)
  protected readonly nativeType = computed(() =>
    this.type() === 'password' && this.revealed() ? 'text' : this.type(),
  )

  constructor() {
    super('')
  }

  protected fromModel(value: string | number | null): string | number | null {
    return value ?? (this.type() === 'number' ? null : '')
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value
    if (this.type() !== 'number') {
      this.commit(text)
      return
    }
    this.commit(text === '' || Number.isNaN(Number(text)) ? null : Number(text))
  }

  protected toggleReveal(): void {
    this.revealed.update((shown) => !shown)
  }
}
