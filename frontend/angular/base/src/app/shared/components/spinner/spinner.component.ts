import { ChangeDetectionStrategy, Component, input } from '@angular/core'

import { TranslatePipe } from '../../pipes/translate.pipe'

// A busy indicator. Alone it is a status region with a translated label; inside a control that
// already says it is busy (the button) it is `decorative` and silent.
@Component({
  selector: 'app-spinner',
  imports: [TranslatePipe],
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpinnerComponent {
  readonly labelKey = input('app.loading')
  readonly decorative = input(false)
}
