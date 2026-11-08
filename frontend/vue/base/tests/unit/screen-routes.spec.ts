// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { capturedRoutes } from '../e2e/screen-routes'

// The screens spec captures a gated nav route only signed in: signed out it is the login redirect
// and would write the same file name as the signed-in capture.
describe('capturedRoutes', () => {
  it('drops the nav routes that are captured signed in and appends the auth screens', () => {
    expect(capturedRoutes(['/', '/profile'], ['/profile'], ['/auth/login'])).toEqual([
      '/',
      '/auth/login',
    ])
  })

  it('keeps every nav route when nothing is signed in', () => {
    expect(capturedRoutes(['/', '/about'], [], [])).toEqual(['/', '/about'])
  })

  it('reads the real nav table by default and never lists a route twice', () => {
    const routes = capturedRoutes()
    expect(routes).toContain('/')
    expect(new Set(routes).size).toBe(routes.length)
  })
})
