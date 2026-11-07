import { CdkTrapFocus } from '@angular/cdk/a11y'
import { DOCUMENT } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router'
import { filter } from 'rxjs'

import { NAV_ENTRIES } from '@app/core/config/nav.token'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { IconComponent } from '@app/shared/components/icon/icon.component'
import { ROLES } from '@app/shared/directives/has-role.directive'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// The primary navigation, from the NAV table. Below lg it is a drawer (`open` shows it); from lg
// it is a column. It closes on navigation and on Escape. An entry with `roles` is filtered against
// the ROLES token.
// `modal` is true while the drawer covers the page: focus moves into it, Tab stays inside, and
// focus returns to the element that opened it when it closes.
@Component({
  selector: 'app-side-nav',
  imports: [
    ButtonComponent,
    CdkTrapFocus,
    IconComponent,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
  ],
  templateUrl: './side-nav.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class SideNavComponent {
  private readonly document = inject(DOCUMENT)
  private readonly injector = inject(Injector)
  private returnTo: HTMLElement | null = null

  private readonly all = inject(NAV_ENTRIES)
  private readonly roles = inject(ROLES)

  // An entry with `roles` shows only to an account that holds one of them.
  protected readonly entries = computed(() =>
    this.all.filter(
      (entry) => !entry.roles || entry.roles.some((role) => this.roles().includes(role)),
    ),
  )

  readonly open = input(false)
  readonly modal = input(false)
  readonly closed = output()

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.close()
      })

    effect(() => {
      const modal = this.modal()
      untracked(() => {
        if (modal) this.capture()
        else this.release()
      })
    })
  }

  protected close(): void {
    if (this.open()) this.closed.emit()
  }

  // Remembers what had focus, then focuses the first control once the drawer is visible.
  private capture(): void {
    const active = this.document.activeElement
    this.returnTo = active instanceof HTMLElement ? active : null
    afterNextRender(
      () => {
        this.document.querySelector<HTMLElement>('#side-nav button, #side-nav a')?.focus()
      },
      { injector: this.injector },
    )
  }

  private release(): void {
    const target = this.returnTo
    this.returnTo = null
    if (!target) return
    afterNextRender(
      () => {
        target.focus()
      },
      { injector: this.injector },
    )
  }
}
