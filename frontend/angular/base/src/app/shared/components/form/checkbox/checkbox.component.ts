import { ChangeDetectionStrategy, Component, forwardRef } from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'

import { ControlBase } from '../form-field/control-base'

// A checkbox bound with `formControlName`; the value is a boolean. The label is the projected
// content (`<app-checkbox formControlName="remember">Remember me</app-checkbox>`), so inside an
// `app-form-field` leave the field's own `label` out: this control already has one.
@Component({
  selector: 'app-checkbox',
  templateUrl: './checkbox.component.html',
  styleUrl: './checkbox.component.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CheckboxComponent), multi: true },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckboxComponent extends ControlBase<boolean> {
  constructor() {
    super(false)
  }

  protected fromModel(value: boolean | null): boolean {
    return value === true
  }

  protected onToggle(event: Event): void {
    this.commit((event.target as HTMLInputElement).checked)
  }
}
