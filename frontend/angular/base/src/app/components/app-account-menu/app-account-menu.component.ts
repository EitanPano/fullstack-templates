import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core'
import { signal, viewChild } from '@angular/core'

import { ButtonComponent } from '@app/shared/components/button/button.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'
import { AuthStore } from '@app/store/auth.store'

// The account control: the sign-in link for a visitor, the avatar and its menu (e-mail, profile,
// sign out) for an account. The host has no box, so it sits wherever the parent places it.
@Component({
  selector: 'app-account-menu',
  imports: [ButtonComponent, TranslatePipe],
  templateUrl: './app-account-menu.component.html',
  styleUrl: './app-account-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppAccountMenuComponent {
  protected readonly auth = inject(AuthStore)

  protected readonly menuOpen = signal(false)
  private readonly menu = viewChild<ElementRef<HTMLElement>>('userMenu')

  // Two letters of the address stand in for a photo.
  protected readonly initials = computed(() =>
    (this.auth.user()?.email ?? '').slice(0, 2).toUpperCase(),
  )

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open)
  }

  protected closeMenu(): void {
    this.menuOpen.set(false)
  }

  // Escape closes the menu and hands focus back to its trigger.
  protected escapeMenu(): void {
    if (!this.menuOpen()) return
    this.closeMenu()
    this.menu()?.nativeElement.querySelector('button')?.focus()
  }

  // Focus leaving the menu (a click elsewhere, Tab past the last item) closes it.
  protected leaveMenu(event: FocusEvent): void {
    const next = event.relatedTarget
    if (next instanceof Node && this.menu()?.nativeElement.contains(next)) return
    this.closeMenu()
  }

  protected signOut(): void {
    this.closeMenu()
    void this.auth.logout()
  }
}
