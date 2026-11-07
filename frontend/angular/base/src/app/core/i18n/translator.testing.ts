import { importProvidersFrom } from '@angular/core' // @i18n
import { TranslocoTestingModule } from '@jsverse/transloco' // @i18n

import { Translator } from '@app/shared/i18n/translator' // @i18n

import { TranslocoTranslator } from './translator.provider' // @i18n
import { provideTranslator } from './translator.provider' // @noi18n
import en from './translations/en.json' // @i18n
import he from './translations/he.json' // @i18n

// The translator for a spec, in either mode. Off, it is the static translator. On, Transloco reads
// en.json and he.json from memory (no HTTP) with both loaded and English active, so an English
// assertion reads the same in both modes. Only specs import this file.

export function provideTestTranslator() {
  return [
    provideTranslator(), // @noi18n
    // @i18n-start
    importProvidersFrom(
      TranslocoTestingModule.forRoot({
        langs: { en, he },
        preloadLangs: true,
        translocoConfig: { availableLangs: ['en', 'he'], defaultLang: 'en', fallbackLang: 'en' },
      }),
    ),
    { provide: Translator, useExisting: TranslocoTranslator },
    // @i18n-end
  ]
}
