export type LanguageCode = 'en' | 'he'

export type Language = {
  readonly code: LanguageCode
  readonly dir: 'ltr' | 'rtl'
  // The BCP 47 tag for Intl formatting (dates, numbers) in this language.
  readonly locale: string
}

// The languages the app ships a copy table for, in the order the toggle cycles. A new language is
// a code in LanguageCode, an entry here and translations/<code>.json (the parity test compares
// every file to en.json).
export const LANGUAGES: readonly Language[] = [
  { code: 'en', dir: 'ltr', locale: 'en-US' },
  { code: 'he', dir: 'rtl', locale: 'he-IL' },
]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'
