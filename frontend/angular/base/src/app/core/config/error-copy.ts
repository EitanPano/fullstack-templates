import { ERROR_CODES } from '@app/models/api/constant'

// The copy-table key for an error code: `errors.<code>`, or `errors.unknown` for any other string.
export function errorMessageKey(code: string): string {
  return (ERROR_CODES as string[]).includes(code) ? `errors.${code}` : 'errors.unknown'
}
