import { describe, expect, it } from 'vitest'

import { match } from './match'

describe('match', () => {
  const rule = match('password', 'confirm')

  it('puts errors.match on the confirm field while the two differ', () => {
    expect(rule({ password: 'abc', confirm: 'abd' })).toEqual({
      confirm: { messageKey: 'errors.match' },
    })
  })

  it('reports nothing when they agree', () => {
    expect(rule({ password: 'abc', confirm: 'abc' })).toBeNull()
  })

  it('treats two empty values as agreeing, so the schema owns the required error', () => {
    expect(rule({ password: '', confirm: '' })).toBeNull()
  })
})
