import { describe, expect, it } from 'vitest'

import en from '@/core/i18n/translations/en.json'

import { NEXT_PARAM, PROFILE_PATH, ROLE_LABEL_KEYS, VERIFY_OTP_PATH } from '@/models/user/constant'

describe('user constants', () => {
  it('names the account paths and the query parameter', () => {
    expect(PROFILE_PATH).toBe('/profile')
    expect(VERIFY_OTP_PATH).toBe('/auth/verify-otp')
    expect(NEXT_PARAM).toBe('next')
  })

  it('has copy for every role the contract declares', () => {
    expect(Object.keys(ROLE_LABEL_KEYS).sort()).toEqual(['admin', 'user'])
    for (const key of Object.values(ROLE_LABEL_KEYS)) {
      const [group, name] = key.split('.') as [string, string]
      expect((en as unknown as Record<string, Record<string, string>>)[group]?.[name]).toBeTruthy()
    }
  })
})
