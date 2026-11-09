import { DOCUMENT } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core'
import { RouterOutlet } from '@angular/router'

import { SkipLinkDirective } from '@app/shared/directives/skip-link.directive'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

import { AppFooterComponent } from '../app-footer/app-footer.component'
import { AppHeaderComponent } from '../app-header/app-header.component'
import { AppSideNavComponent } from '../app-side-nav/app-side-nav.component'

// The lg breakpoint of styles/setup/_breakpoints.scss: from here the nav is a static column.
const WIDE_QUERY = '(min-width: 1024px)'

// The frame of every signed-in or public screen: skip link, header, side-nav, the page's one
// <main id="main">, footer. A page renders inside main and adds no landmark of its own.
@Component({
  selector: 'app-main-layout',
  imports: [
    AppFooterComponent,
    AppHeaderComponent,
    RouterOutlet,
    AppSideNavComponent,
    SkipLinkDirective,
    TranslatePipe,
  ],
  templateUrl: './app-main-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppMainLayoutComponent {
  // The side-nav drawer below lg; the header toggles it, the side-nav binds it two-way and closes it.
  protected readonly navOpen = signal(false)
  private readonly wide = signal(false)

  // The drawer covers the page: the page behind it is inert and focus stays in the drawer.
  protected readonly modal = computed(() => this.navOpen() && !this.wide())

  constructor() {
    const win = inject(DOCUMENT).defaultView
    if (win && typeof win.matchMedia === 'function') {
      const media = win.matchMedia(WIDE_QUERY)
      this.wide.set(media.matches)
      const onChange = (event: MediaQueryListEvent) => {
        this.wide.set(event.matches)
        // A drawer left open would reappear on shrinking, with no visible toggle to close it.
        if (event.matches) this.navOpen.set(false)
      }
      media.addEventListener('change', onChange)
      inject(DestroyRef).onDestroy(() => {
        media.removeEventListener('change', onChange)
      })
    }
  }

  protected toggleNav(): void {
    this.navOpen.update((open) => !open)
  }
}
