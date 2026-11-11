import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

import { TranslatePipe } from '../../../pipes/translate.pipe'
import { ButtonComponent } from '../../button/button.component'

// The submit row of a form: a primary submit button (spinner and inert while `pending`) and an
// optional secondary cancel. The submit is a real `type="submit"`, so the form's `(ngSubmit)` fires.
// Stacked on phones, inline from `md`. Labels are keys of the copy table.
@Component({
  selector: 'app-form-actions',
  imports: [ButtonComponent, TranslatePipe],
  templateUrl: './form-actions.component.html',
  styleUrl: './form-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormActionsComponent {
  readonly submitKey = input('form.submit')
  readonly cancelKey = input('form.cancel')
  readonly pending = input(false)
  readonly disabled = input(false)
  readonly cancellable = input(false)
  readonly cancelled = output()
}
