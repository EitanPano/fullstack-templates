import { differenceIn, parseTime } from './time'

const formatters = new Map<string, Intl.RelativeTimeFormat>()

function formatterFor(lang: string): Intl.RelativeTimeFormat {
  let formatter = formatters.get(lang)
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
    formatters.set(lang, formatter)
  }
  return formatter
}

// An ISO string or a Date as "3 minutes ago" or "in 2 days" in `lang`. Unreadable or empty input
// gives ''. A template calls it with the active language, so the text follows a language switch;
// `now` is the clock, which a test fixes. The formatter is cached per language.
export function relativeTime(
  value: string | Date | null | undefined,
  lang: string,
  now: Date = new Date(),
): string {
  if (value === null || value === undefined) return ''
  const date = parseTime(value)
  if (!date) return ''
  const { value: amount, unit } = differenceIn(date, now)
  return formatterFor(lang).format(amount, unit)
}
