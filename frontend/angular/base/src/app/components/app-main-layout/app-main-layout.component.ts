import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'

import { SkipLinkDirective } from '@app/shared/directives/skip-link.directive'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// The frame of every signed-in or public screen: the skip link and the page's one
// <main id="main">. Nothing else: the product's header, navigation and footer are its own
// components (AGENTS.md, The shell). `main` has no width or padding; a page gets its container
// from `app-page`, and a full-bleed page leaves it out.
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, SkipLinkDirective, TranslatePipe],
  templateUrl: './app-main-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppMainLayoutComponent {}
