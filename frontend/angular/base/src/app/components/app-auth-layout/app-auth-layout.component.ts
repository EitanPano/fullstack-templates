import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterLink, RouterOutlet } from '@angular/router'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { SkipLinkDirective } from '@app/shared/directives/skip-link.directive'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

import { AppFooterComponent } from '../app-footer/app-footer.component'

// The frame of the sign-in, register and verification screens: a skip link, the product name
// linking home, one centred <main id="main"> and the footer. No side-nav and no header: a visitor
// has nowhere else to go yet.
@Component({
  selector: 'app-auth-layout',
  imports: [AppFooterComponent, RouterLink, RouterOutlet, SkipLinkDirective, TranslatePipe],
  templateUrl: './app-auth-layout.component.html',
  styleUrl: './app-auth-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppAuthLayoutComponent {
  protected readonly name = DISPLAY_NAME
}
