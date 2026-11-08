import { env } from '@/core/config/env'

// A missing key renders as the key itself; in development it also warns, so a typo or a key added
// to the code and not to the table shows in the console. Silent in production.
export function warnMissingKey(
  locale: string,
  key: string,
  production = env.MODE === 'production',
): void {
  if (production) return
  console.warn(`[i18n] missing key "${key}" for locale "${locale}"`)
}
