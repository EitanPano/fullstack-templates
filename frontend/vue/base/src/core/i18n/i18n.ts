import { createI18n } from 'vue-i18n'

import { warnMissingKey } from './missing-key.handler'
import en from './translations/en.json'

// vue-i18n in the Composition API mode, English bundled. `t` is the one translator; components
// call `$t` in templates and `useI18n()` in script. A missing key renders as itself and warns in
// development.
export function createAppI18n() {
  // Keyed by string, so the locale can be switched to the code of a table a flag loads.
  const messages: Record<string, typeof en> = { en }
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages,
    missingWarn: false,
    fallbackWarn: false,
    missing: (locale, key) => {
      warnMissingKey(locale, key)
      return key
    },
  })
}

export const i18n = createAppI18n()
