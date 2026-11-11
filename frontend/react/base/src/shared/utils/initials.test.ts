import { describe, expect, it } from 'vitest'

import { initials } from '@/shared/utils/initials'

describe('initials', () => {
  it('takes two letters of the name for the avatar', () => {
    expect(initials({ email: 'ada.lovelace@example.com' })).toBe('AD')
  })

  it('is undefined when the name has no letters or digits', () => {
    expect(initials({ email: '--@example.com' })).toBeUndefined()
  })
})
