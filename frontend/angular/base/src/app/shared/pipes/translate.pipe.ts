import { Pipe, PipeTransform, inject } from '@angular/core'

import { Translator } from '../i18n/translator'

// `{{ 'nav.open' | t }}` and `{{ 'toast.saved' | t: { name } }}`. Impure so it re-reads the key
// when the language changes; reading `lang()` ties the call to the signal.
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly translator = inject(Translator)

  transform(key: string, params?: Record<string, string | number>): string {
    this.translator.lang()
    return this.translator.translate(key, params)
  }
}
