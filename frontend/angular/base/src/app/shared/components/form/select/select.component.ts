import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'

import { TranslatePipe } from '../../../pipes/translate.pipe'
import { ControlBase } from '../form-field/control-base'

export interface SelectOption {
  readonly value: string
  readonly labelKey: string
}

// A <select> bound with `formControlName`; the value is the chosen option's `value` string. With
// `emptyKey` set, a first option with the value '' (and that label) lets the user choose nothing.
@Component({
  selector: 'app-select',
  imports: [TranslatePipe],
  templateUrl: './select.component.html',
  styleUrls: ['../controls.scss'],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectComponent extends ControlBase<string> {
  readonly options = input.required<readonly SelectOption[]>()
  readonly emptyKey = input<string | null>(null)

  constructor() {
    super('')
  }

  protected fromModel(value: string | null): string {
    return value ?? ''
  }

  protected onSelect(event: Event): void {
    this.commit((event.target as HTMLSelectElement).value)
  }
}
