import { describe, expect, it } from 'vitest'

import { isUser } from '@/shared/utils/is-user'
import { USER } from '@/testing/auth-fixtures'

describe('isUser', () => {
  it('accepts an account of either role', () => {
    expect(isUser(USER)).toBe(true)
    expect(isUser({ ...USER, role: 'admin' })).toBe(true)
  })

  it.each([
    ['null', null],
    ['a string', 'ada'],
    ['an object without an id', { email: 'a@b.co', role: 'user' }],
    ['an object without an email', { id: 'u1', role: 'user' }],
    ['an unknown role', { ...USER, role: 'root' }],
  ])('refuses %s', (_what, value) => {
    expect(isUser(value)).toBe(false)
  })
})
