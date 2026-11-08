export type LanguageCode = 'en' | 'he'

export type Language = {
  readonly code: LanguageCode
  readonly dir: 'ltr' | 'rtl'
  // The BCP 47 tag for Intl formatting (dates, numbers) in this language.
  readonly locale: string
}

// English is bundled and the fallback of every other language.
export const ENGLISH: Language = { code: 'en', dir: 'ltr', locale: 'en-US' }

// The languages the app ships a copy table for, in the order the toggle cycles. A new language is
// a code in LanguageCode, an entry here, an entry in the store's loaders and
// translations/<code>.json (the parity test compares every file to en.json).
export const LANGUAGES: readonly Language[] = [ENGLISH, { code: 'he', dir: 'rtl', locale: 'he-IL' }]

export const DEFAULT_LANGUAGE: LanguageCode = ENGLISH.code
