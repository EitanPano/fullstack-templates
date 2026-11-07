import { Injectable, inject } from '@angular/core'
import { signal } from '@angular/core' // @noi18n
import { toSignal } from '@angular/core/rxjs-interop' // @i18n
import { TranslocoService } from '@jsverse/transloco' // @i18n

import { Translator } from '@app/shared/i18n/translator'

import { LoggerService } from '../providers/logger.service' // @noi18n
import { provideI18n } from './i18n.config' // @i18n
import en from './translations/en.json' // @noi18n

// The one file that knows which translation library, if any, answers `Translator`. Templates and
// code ask the `t` pipe or `inject(Translator)` and never branch on the i18n flag.

// @noi18n-start
// Reads the bundled en.json by dot path ('notFound.title') and fills `{{param}}` placeholders. A
// missing key returns the key itself and logs a warning.
@Injectable({ providedIn: 'root' })
export class StaticTranslator extends Translator {
  private readonly logger = inject(LoggerService)

  readonly lang = signal('en').asReadonly()

  translate(key: string, params?: Record<string, string | number>): string {
    const text = this.lookup(key)
    if (text === undefined) {
      this.logger.warn(`Missing translation key: ${key}`)
      return key
    }
    if (!params) return text
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
      return Object.hasOwn(params, name) ? String(params[name]) : match
    })
  }

  private lookup(key: string): string | undefined {
    let node: unknown = en
    for (const part of key.split('.')) {
      if (typeof node !== 'object' || node === null) return undefined
      node = (node as Record<string, unknown>)[part]
    }
    return typeof node === 'string' ? node : undefined
  }
}
// @noi18n-end

// @i18n-start
// Answers from Transloco's loaded copy table; `lang` follows the active language, so the `t` pipe
// re-reads on a switch. A missing key is handled by MissingKeyHandler (the key, and a warning).
@Injectable({ providedIn: 'root' })
export class TranslocoTranslator extends Translator {
  private readonly transloco = inject(TranslocoService)

  readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  })

  translate(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}
// @i18n-end

// Providers listed later win. The catalog's own tree keeps both bindings, so the on bindings come
// last and Transloco answers there; a generated project keeps one set of lines.
export function provideTranslator() {
  return [
    { provide: Translator, useExisting: StaticTranslator }, // @noi18n
    ...provideI18n(), // @i18n
    { provide: Translator, useExisting: TranslocoTranslator }, // @i18n
  ]
}
