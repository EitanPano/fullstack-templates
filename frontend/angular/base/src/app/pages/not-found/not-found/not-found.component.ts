import { ChangeDetectionStrategy, Component } from '@angular/core'

import { ButtonComponent } from '@app/shared/components/button/button.component'
import { PageHeaderComponent } from '@app/shared/components/page-header/page-header.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

@Component({
  selector: 'app-not-found',
  imports: [ButtonComponent, PageHeaderComponent, TranslatePipe],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
