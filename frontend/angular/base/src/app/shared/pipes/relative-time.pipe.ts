import { InjectionToken, Pipe, PipeTransform, inject } from '@angular/core'

import { Translator } from '../i18n/translator'
import { differenceIn, parseTime } from '../utils/time'

// The clock the pipe reads; a test provides a fixed one.
export const NOW = new InjectionToken<() => Date>('NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
})

const formatters = new Map<string, Intl.RelativeTimeFormat>()

function formatterFor(lang: string): Intl.RelativeTimeFormat {
  let formatter = formatters.get(lang)
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
    formatters.set(lang, formatter)
  }
  return formatter
}

// `{{ post.createdAt | relativeTime }}`: an ISO string or a Date as "3 minutes ago" / "in 2 days"
// in the translator's language. Unreadable or empty input gives ''. Impure so the text follows the
// clock and the language on each change detection; the formatter is cached per language.
@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly translator = inject(Translator)
  private readonly now = inject(NOW)

  transform(value: string | Date | null | undefined): string {
    if (value === null || value === undefined) return ''
    const date = parseTime(value)
    if (!date) return ''
    const { value: amount, unit } = differenceIn(date, this.now())
    return formatterFor(this.translator.lang()).format(amount, unit)
  }
}
