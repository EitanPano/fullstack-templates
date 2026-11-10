import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterLink, RouterOutlet } from '@angular/router'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { SkipLinkDirective } from '@app/shared/directives/skip-link.directive'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// The frame of the sign-in, register and verification screens: a skip link, the product name
// linking home and one centred <main id="main">. No navigation: a visitor has nowhere else to go
// yet.
@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink, RouterOutlet, SkipLinkDirective, TranslatePipe],
  templateUrl: './app-auth-layout.component.html',
  styleUrl: './app-auth-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppAuthLayoutComponent {
  protected readonly name = DISPLAY_NAME
}
