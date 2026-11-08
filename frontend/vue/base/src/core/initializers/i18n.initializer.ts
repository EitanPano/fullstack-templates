import { DEFAULT_LANGUAGE } from '@/core/i18n/languages'
import { useLanguageStore } from '@/store/language.store'

// Resolves the language and awaits its copy table before first render, so the first paint is in
// the right language and direction. If the saved or browser language cannot load, English stays.
// Needs the active Pinia.
export async function initializeI18n(): Promise<void> {
  const language = useLanguageStore()
  const code = language.initial()
  if (code === DEFAULT_LANGUAGE) return
  await language.setLang(code, false)
}
