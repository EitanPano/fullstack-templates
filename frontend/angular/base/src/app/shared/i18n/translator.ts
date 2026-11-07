import type { Signal } from '@angular/core'

// What templates and code ask for text. core/i18n/translator.provider.ts binds it, so a template
// never knows which translation library (if any) answers.
export abstract class Translator {
  // The active language code; it changes when the language changes, so the `t` pipe re-reads.
  abstract readonly lang: Signal<string>

  // The text for a key of the copy table, `{{param}}` placeholders filled from `params`.
  abstract translate(key: string, params?: Record<string, string | number>): string
}
