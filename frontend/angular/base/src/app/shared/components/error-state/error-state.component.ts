import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

import { TranslatePipe } from '../../pipes/translate.pipe'
import { ButtonComponent } from '../button/button.component'
import { IconComponent } from '../icon/icon.component'

// What a page or region shows when its data failed to load. The copy follows the error (see
// AGENTS.md > Errors); the defaults are the generic ones. `retry` fires when the button is pressed.
@Component({
  selector: 'app-error-state',
  imports: [ButtonComponent, IconComponent, TranslatePipe],
  templateUrl: './error-state.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  readonly heading = input<string | null>(null)
  readonly description = input<string | null>(null)
  readonly retryable = input(true)
  readonly retry = output()
}
