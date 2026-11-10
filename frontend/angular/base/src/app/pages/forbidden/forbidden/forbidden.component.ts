import { ChangeDetectionStrategy, Component } from '@angular/core'

import { ButtonComponent } from '@app/shared/components/button/button.component'
import { PageComponent } from '@app/shared/components/page/page.component'
import { PageHeaderComponent } from '@app/shared/components/page-header/page-header.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// Where roleGuard sends an account that holds the wrong role.
@Component({
  selector: 'app-forbidden',
  imports: [ButtonComponent, PageComponent, PageHeaderComponent, TranslatePipe],
  templateUrl: './forbidden.component.html',
  styleUrl: './forbidden.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForbiddenComponent {}
