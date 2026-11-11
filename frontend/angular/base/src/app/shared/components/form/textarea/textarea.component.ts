import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'

import { TranslatePipe } from '../../../pipes/translate.pipe'
import { ControlBase } from '../form-field/control-base'

// A multi-line <textarea> bound with `formControlName`. With `maxlength` set it also shows how many
// characters are left. `placeholder` arrives translated.
@Component({
  selector: 'app-textarea',
  imports: [TranslatePipe],
  templateUrl: './textarea.component.html',
  styleUrls: ['../controls.scss'],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextareaComponent), multi: true },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextareaComponent extends ControlBase<string> {
  readonly rows = input(4)
  readonly maxlength = input<number | null>(null)
  readonly placeholder = input<string | null>(null)
  readonly readonly = input(false)

  protected readonly counterId = `${this.controlId}-counter`
  protected readonly remaining = computed(() => {
    const max = this.maxlength()
    return max === null ? null : Math.max(0, max - this.value().length)
  })
  protected readonly describedByAll = computed(() => {
    const ids = [this.describedBy(), this.maxlength() === null ? null : this.counterId]
    const joined = ids.filter(Boolean).join(' ')
    return joined === '' ? null : joined
  })

  constructor() {
    super('')
  }

  protected fromModel(value: string | null): string {
    return value ?? ''
  }

  protected onInput(event: Event): void {
    this.commit((event.target as HTMLTextAreaElement).value)
  }
}
