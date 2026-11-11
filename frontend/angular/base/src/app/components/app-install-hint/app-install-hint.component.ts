import { ChangeDetectionStrategy, Component, inject } from '@angular/core'

import { InstallPromptService } from '@app/core/providers/install-prompt.service'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { IconComponent } from '@app/shared/components/icon/icon.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// The iOS Safari install hint: a full-width row that tells a visitor to use the share sheet, with
// a dismiss that keeps it away. It renders nothing on any other browser. The product places it as
// a row of its own; the toolbar button is `app-install-button`.
@Component({
  selector: 'app-install-hint',
  imports: [ButtonComponent, IconComponent, TranslatePipe],
  templateUrl: './app-install-hint.component.html',
  styleUrl: './app-install-hint.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppInstallHintComponent {
  protected readonly install = inject(InstallPromptService)
}
