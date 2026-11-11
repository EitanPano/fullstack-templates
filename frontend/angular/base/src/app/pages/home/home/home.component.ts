import { ChangeDetectionStrategy, Component } from '@angular/core'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { PageComponent } from '@app/shared/components/page/page.component'
import { PageHeaderComponent } from '@app/shared/components/page-header/page-header.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// The index route: the product name as the page's one h1 and a line to replace. It calls no API.
@Component({
  selector: 'app-home',
  imports: [PageComponent, PageHeaderComponent, TranslatePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly name = DISPLAY_NAME
}
