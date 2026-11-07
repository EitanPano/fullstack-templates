import { inject, provideAppInitializer, type EnvironmentProviders } from '@angular/core'

import { DEFAULT_LANGUAGE } from '../i18n/languages'
import { LanguageService } from '../i18n/language.service'

// Resolves the language and awaits its copy table before first render, so the first paint is in
// the right language and direction. If the saved or browser language cannot load, English does.
export function provideI18nInitializer(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const language = inject(LanguageService)
    const code = language.initial()
    if (!(await language.setLang(code, false)) && code !== DEFAULT_LANGUAGE) {
      await language.setLang(DEFAULT_LANGUAGE, false)
    }
  })
}
