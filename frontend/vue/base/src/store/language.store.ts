import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { STORAGE_KEYS } from '@/core/config/constants'
import { i18n } from '@/core/i18n/i18n'
import type English from '@/core/i18n/translations/en.json'
import {
  DEFAULT_LANGUAGE,
  ENGLISH,
  LANGUAGES,
  type Language,
  type LanguageCode,
} from '@/core/i18n/languages'
import { logger } from '@/core/providers/logger'
import { storage } from '@/core/providers/storage'

// Every table has the shape of the English one (the parity test holds the keys to it).
type Messages = typeof English

// English is bundled; every other table is its own chunk, fetched the first time it is chosen.
const LOADERS: Partial<Record<LanguageCode, () => Promise<{ default: Messages }>>> = {
  he: () => import('@/core/i18n/translations/he.json'),
}

function find(code: unknown): Language | undefined {
  return typeof code === 'string' ? LANGUAGES.find((language) => language.code === code) : undefined
}

// The active language: it loads the copy table, switches vue-i18n, writes <html lang> and
// <html dir> (the layout mirrors through logical properties) and remembers the choice.
export const useLanguageStore = defineStore('language', () => {
  const code = ref<LanguageCode>(DEFAULT_LANGUAGE)
  const language = computed(() => find(code.value) ?? ENGLISH)
  const dir = computed(() => language.value.dir)
  // The language the toggle switches to: the one after the active language, wrapping around.
  const next = computed(() => {
    const index = LANGUAGES.findIndex((entry) => entry.code === code.value)
    return LANGUAGES[(index + 1) % LANGUAGES.length] ?? ENGLISH
  })

  // The saved choice, else the first browser language that has a copy table, else English.
  function initial(): LanguageCode {
    const saved = find(storage.get(STORAGE_KEYS.lang))
    if (saved) return saved.code
    for (const tag of window.navigator.languages) {
      const match = find(tag.toLowerCase().split('-')[0])
      if (match) return match.code
    }
    return DEFAULT_LANGUAGE
  }

  // A table that is not in memory is fetched; success means this very code has messages.
  async function load(target: LanguageCode): Promise<boolean> {
    if (Object.keys(i18n.global.getLocaleMessage(target)).length > 0) return true
    const loader = LOADERS[target]
    if (!loader) return false
    try {
      const messages = (await loader()).default
      if (Object.keys(messages).length === 0) {
        logger.error(`The ${target} copy table is empty`)
        return false
      }
      i18n.global.setLocaleMessage(target, messages)
      return true
    } catch (cause) {
      logger.error(`Could not load the ${target} copy table`, cause)
      return false
    }
  }

  // Loads the copy table, then switches, so the page never renders keys in the new language. It
  // resolves false and changes nothing when the code is unknown or the table cannot be loaded.
  // Only a user choice persists: the initializer passes persist=false so a browser default stays one.
  async function setLang(target: string, persist = true): Promise<boolean> {
    const chosen = find(target)
    if (!chosen) return false
    if (!(await load(chosen.code))) return false
    i18n.global.locale.value = chosen.code
    code.value = chosen.code
    const root = document.documentElement
    root.setAttribute('lang', chosen.code)
    root.setAttribute('dir', chosen.dir)
    if (persist) storage.set(STORAGE_KEYS.lang, chosen.code)
    return true
  }

  return { code, dir, next, initial, setLang }
})
