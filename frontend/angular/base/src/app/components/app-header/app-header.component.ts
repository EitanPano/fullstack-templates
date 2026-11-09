import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core'
import { ElementRef, signal, viewChild } from '@angular/core' // @server:auth
import { RouterLink } from '@angular/router'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { LanguageService } from '@app/core/i18n/language.service' // @i18n
import { InstallPromptService } from '@app/core/providers/install-prompt.service' // @pwa
import { NetworkService } from '@app/core/providers/network.service'
import { ThemeService, type ThemePreference } from '@app/core/providers/theme.service'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { IconComponent, type IconName } from '@app/shared/components/icon/icon.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'
import { AuthStore } from '@app/store/auth.store' // @server:auth

const THEME_ICON: Record<ThemePreference, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
}
const NEXT: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

// The banner: the product name (home), the language and theme toggles, the offline badge and, below
// lg, the button that opens the side-nav drawer.
@Component({
  selector: 'app-header',
  imports: [ButtonComponent, IconComponent, RouterLink, TranslatePipe],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeaderComponent {
  protected readonly theme = inject(ThemeService)
  protected readonly network = inject(NetworkService)
  protected readonly name = DISPLAY_NAME
  protected readonly language = inject(LanguageService) // @i18n
  protected readonly install = inject(InstallPromptService) // @pwa
  protected readonly auth = inject(AuthStore) // @server:auth

  readonly navOpen = input(false)
  readonly navToggle = output()

  protected readonly themeIcon = computed(() => THEME_ICON[this.theme.preference()])
  protected readonly current = computed(() => `theme.${this.theme.preference()}`)
  protected readonly next = computed(() => `theme.${NEXT[this.theme.preference()]}`)

  // @i18n-start
  protected readonly nextName = computed(() => `language.name.${this.language.next().code}`)
  protected readonly currentName = computed(() => `language.name.${this.language.lang()}`)

  protected switchLanguage(): void {
    void this.language.setLang(this.language.next().code)
  }
  // @i18n-end

  // @server:auth-start
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
  // @server:auth-end

  // @pwa-start
  protected installApp(): void {
    void this.install.promptInstall()
  }
  // @pwa-end
}
