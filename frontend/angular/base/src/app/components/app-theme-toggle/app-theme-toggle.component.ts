import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'

import { ThemeService, type ThemePreference } from '@app/core/providers/theme.service'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { IconComponent, type IconName } from '@app/shared/components/icon/icon.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

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

// The one theme toggle: a ghost icon button that cycles light, dark and system, and announces the
// current choice. The host has no box, so it sits wherever the parent places it.
@Component({
  selector: 'app-theme-toggle',
  imports: [ButtonComponent, IconComponent, TranslatePipe],
  templateUrl: './app-theme-toggle.component.html',
  styleUrl: './app-theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppThemeToggleComponent {
  protected readonly theme = inject(ThemeService)

  protected readonly themeIcon = computed(() => THEME_ICON[this.theme.preference()])
  protected readonly current = computed(() => `theme.${this.theme.preference()}`)
  protected readonly next = computed(() => `theme.${NEXT[this.theme.preference()]}`)
}
