import { ERROR_CODES } from '@app/models/api/constant'
import en from '@app/core/i18n/translations/en.json'

import { errorMessageKey } from './error-copy'

describe('error copy', () => {
  it('has a message in en.json for every code, and for the shared fallbacks', () => {
    for (const code of ERROR_CODES) {
      expect(en.errors, `errors.${code}`).toHaveProperty(code)
    }
    for (const key of ['unknown', 'network', 'offline', 'unexpected']) {
      expect(en.errors).toHaveProperty(key)
    }
  })

  it('maps a code to its key and any other string to errors.unknown', () => {
    expect(errorMessageKey('conflict')).toBe('errors.conflict')
    expect(errorMessageKey('network')).toBe('errors.network')
    expect(errorMessageKey('teapot')).toBe('errors.unknown')
    expect(errorMessageKey('constructor')).toBe('errors.unknown')
  })
})
