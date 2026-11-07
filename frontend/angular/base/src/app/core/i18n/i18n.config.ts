import type { EnvironmentProviders } from '@angular/core'
import {
  provideTransloco,
  provideTranslocoMissingHandler,
  translocoConfig,
} from '@jsverse/transloco'

import { environment } from '../../../environments/environment'
import { DEFAULT_LANGUAGE, LANGUAGES } from './languages'
import { MissingKeyHandler } from './missing-key.handler'
import { TranslocoHttpLoader } from './transloco-http.loader'

export const TRANSLOCO_APP_CONFIG = translocoConfig({
  availableLangs: LANGUAGES.map((language) => language.code),
  defaultLang: DEFAULT_LANGUAGE,
  fallbackLang: DEFAULT_LANGUAGE,
  reRenderOnLangChange: true,
  prodMode: environment.production,
  // A key missing from the active table reads from the fallback table before the handler runs.
  missingHandler: { useFallbackTranslation: true },
})

export function provideI18n(): EnvironmentProviders[] {
  return [
    ...provideTransloco({ config: TRANSLOCO_APP_CONFIG, loader: TranslocoHttpLoader }),
    provideTranslocoMissingHandler(MissingKeyHandler),
  ]
}
