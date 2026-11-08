import { describe, expect, it } from 'vitest'

import { authGuard } from '@/core/guards/auth.guard'
import { PROFILE_PATH } from '@/models/user/constants'

import routes from './user.routes'

describe('user routes', () => {
  it('serves the profile behind authGuard, titled', () => {
    expect(routes).toHaveLength(1)
    expect(`/${routes[0]?.path ?? ''}`).toBe(PROFILE_PATH)
    expect(routes[0]?.beforeEnter).toBe(authGuard)
    expect(routes[0]?.meta?.titleKey).toBe('profile.title')
  })
})
