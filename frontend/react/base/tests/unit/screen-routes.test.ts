import { describe, expect, it } from 'vitest'

import { capturedRoutes } from '../e2e/screen-routes'

describe('capturedRoutes', () => {
  it('keeps every nav route when none is captured signed in', () => {
    expect(capturedRoutes(['/', '/about'], [])).toEqual(['/', '/about'])
  })

  it('leaves out a gated nav route, which is captured signed in', () => {
    expect(capturedRoutes(['/', '/booking', '/about'], ['/booking', '/profile'])).toEqual([
      '/',
      '/about',
    ])
  })
})
