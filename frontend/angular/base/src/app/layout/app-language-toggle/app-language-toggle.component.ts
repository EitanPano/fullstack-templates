import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'

import { LanguageService } from '@app/core/i18n/language.service'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// The language toggle: a ghost button naming the other language, and a status line announcing the
// current one. The host has no box, so it sits wherever the parent places it.
@Component({
  selector: 'app-language-toggle',
  imports: [ButtonComponent, TranslatePipe],
  templateUrl: './app-language-toggle.component.html',
  styleUrl: './app-language-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLanguageToggleComponent {
  protected readonly language = inject(LanguageService)

  protected readonly nextName = computed(() => `language.name.${this.language.next().code}`)
  protected readonly currentName = computed(() => `language.name.${this.language.lang()}`)

  protected switchLanguage(): void {
    void this.language.setLang(this.language.next().code)
  }
}
