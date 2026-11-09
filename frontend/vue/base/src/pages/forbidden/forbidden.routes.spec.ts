import { describe, expect, it } from 'vitest'

import { FORBIDDEN_PATH } from '@/core/config/constants'

import routes from './forbidden.routes'

describe('forbidden routes', () => {
  it('serves the page at the path roleGuard sends to, open to anyone, titled', () => {
    expect(routes).toHaveLength(1)
    expect(`/${routes[0]?.path ?? ''}`).toBe(FORBIDDEN_PATH)
    expect(routes[0]?.meta?.titleKey).toBe('forbidden.title')
    expect(routes[0]?.beforeEnter).toBeUndefined()
  })
})
