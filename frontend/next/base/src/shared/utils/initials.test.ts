import { describe, expect, it } from 'vitest'

import { initials } from './initials'

describe('initials', () => {
  it('takes the first two letters of the part before the @', () => {
    expect(initials({ email: 'ada.lovelace@example.com' })).toBe('AD')
    expect(initials({ email: 'x@example.com' })).toBe('X')
  })

  it('has no initials for something that is not an email', () => {
    expect(initials({ email: '' })).toBeUndefined()
    expect(initials({ email: '@example.com' })).toBeUndefined()
  })
})
