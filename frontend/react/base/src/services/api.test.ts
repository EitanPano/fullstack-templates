import { describe, expect, it } from 'vitest'

import { refetchIfRejected } from '@/services/api'

describe('refetchIfRejected', () => {
  it('asks for a refetch when the entry last failed, so Try again can recover', () => {
    expect(refetchIfRejected({ endpointState: { status: 'rejected' } })).toBe(true)
  })

  it.each(['fulfilled', 'pending', 'uninitialized'])(
    'leaves a %s entry to its 30 s window',
    (status) => {
      expect(refetchIfRejected({ endpointState: { status } })).toBe(false)
    },
  )

  it('does nothing for an entry that does not exist yet', () => {
    expect(refetchIfRejected({})).toBe(false)
  })
})
