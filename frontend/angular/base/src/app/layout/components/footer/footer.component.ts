import { ChangeDetectionStrategy, Component } from '@angular/core'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

@Component({
  selector: 'app-footer',
  imports: [TranslatePipe],
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  protected readonly name = DISPLAY_NAME
  protected readonly year = new Date().getFullYear()
}
