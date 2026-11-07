import { ChangeDetectionStrategy, Component } from '@angular/core'

import { ButtonComponent } from '@app/shared/components/button/button.component'
import { PageHeaderComponent } from '@app/shared/components/page-header/page-header.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// Where roleGuard sends an account that holds the wrong role.
@Component({
  selector: 'app-forbidden',
  imports: [ButtonComponent, PageHeaderComponent, TranslatePipe],
  templateUrl: './forbidden.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForbiddenComponent {}
