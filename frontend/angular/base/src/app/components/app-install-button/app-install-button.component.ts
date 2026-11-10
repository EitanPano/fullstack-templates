import { ChangeDetectionStrategy, Component, inject } from '@angular/core'

import { InstallPromptService } from '@app/core/providers/install-prompt.service'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// The install button: a toolbar control, shown only once the browser offers an install. The host
// has no box, so it sits wherever the product places it. The iOS hint is `app-install-hint`.
@Component({
  selector: 'app-install-button',
  imports: [ButtonComponent, TranslatePipe],
  templateUrl: './app-install-button.component.html',
  styleUrl: './app-install-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppInstallButtonComponent {
  protected readonly install = inject(InstallPromptService)

  protected installApp(): void {
    void this.install.promptInstall()
  }
}
