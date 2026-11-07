import { DOCUMENT } from '@angular/common'
import { Injectable, computed, inject } from '@angular/core'
import { TranslocoService } from '@jsverse/transloco'
import { firstValueFrom } from 'rxjs'

import { STORAGE_KEYS } from '../config/constants'
import { LoggerService } from '../providers/logger.service'
import { StorageService } from '../providers/storage.service'
import { DEFAULT_LANGUAGE, LANGUAGES, type Language, type LanguageCode } from './languages'

function find(code: unknown): Language | undefined {
  return typeof code === 'string' ? LANGUAGES.find((language) => language.code === code) : undefined
}

// The active language: it loads the copy table, writes <html lang> and <html dir> (the layout
// mirrors through logical properties) and remembers the choice.
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService)
  private readonly storage = inject(StorageService)
  private readonly logger = inject(LoggerService)
  private readonly document = inject(DOCUMENT)

  readonly languages = LANGUAGES
  readonly lang = this.transloco.activeLang
  readonly dir = computed(() => find(this.lang())?.dir ?? 'ltr')
  // The language the toggle switches to: the one after the active language, wrapping around.
  readonly next = computed(() => {
    const index = LANGUAGES.findIndex((language) => language.code === this.lang())
    return LANGUAGES[(index + 1) % LANGUAGES.length] ?? LANGUAGES[0]
  })

  // The saved choice, else the first browser language that has a copy table, else English.
  initial(): LanguageCode {
    const saved = find(this.storage.get(STORAGE_KEYS.lang))
    if (saved) return saved.code
    const preferred = this.document.defaultView?.navigator.languages ?? []
    for (const tag of preferred) {
      const match = find(tag.toLowerCase().split('-')[0])
      if (match) return match.code
    }
    return DEFAULT_LANGUAGE
  }

  // Loads the copy table, then switches, so the page never renders keys in the new language. It
  // resolves false and changes nothing when the code is unknown or the table cannot be loaded. Only
  // a user choice persists: the initializer passes persist=false so a browser default stays one.
  async setLang(code: string, persist = true): Promise<boolean> {
    const language = find(code)
    if (!language) return false
    if (!(await this.load(language.code))) return false
    this.transloco.setActiveLang(language.code)
    const root = this.document.documentElement
    root.setAttribute('lang', language.code)
    root.setAttribute('dir', language.dir)
    if (persist) this.storage.set(STORAGE_KEYS.lang, language.code)
    return true
  }

  // Transloco answers a failed load with the fallback table, which is not the language asked for,
  // so success means the table for this very code is present.
  private async load(code: LanguageCode): Promise<boolean> {
    try {
      await firstValueFrom(this.transloco.load(code))
      if (Object.keys(this.transloco.getTranslation(code)).length > 0) return true
      this.logger.error(`The ${code} copy table is empty`)
    } catch (cause) {
      this.logger.error(`Could not load the ${code} copy table`, cause)
    }
    return false
  }
}
