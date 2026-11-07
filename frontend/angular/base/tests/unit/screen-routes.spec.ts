// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { NAV } from '../../src/app/nav'
import { SIGNED_IN_ROUTES, capturedRoutes } from '../e2e/screen-routes'
import { AUTH_ROUTES } from '../e2e/screen-routes' // @server:auth

describe('capturedRoutes', () => {
  it('covers every nav route', () => {
    const routes = capturedRoutes()

    for (const entry of NAV) {
      expect(routes.includes(entry.path) || SIGNED_IN_ROUTES.includes(entry.path)).toBe(true)
    }
  })

  it('keeps every nav route when none is captured signed in', () => {
    expect(capturedRoutes(['/', '/about'], [], [])).toEqual(['/', '/about'])
  })

  it('leaves out a gated nav route, which is captured signed in, and adds the auth screens', () => {
    expect(
      capturedRoutes(['/', '/booking', '/about'], ['/booking', '/profile'], ['/auth/login']),
    ).toEqual(['/', '/about', '/auth/login'])
  })

  it('never captures a signed-in route signed out', () => {
    for (const route of SIGNED_IN_ROUTES) expect(capturedRoutes()).not.toContain(route)
  })
})

// @server:auth-start
describe('the auth screens', () => {
  it('are captured signed out, and the account screens signed in', () => {
    expect(AUTH_ROUTES).toEqual(expect.arrayContaining(['/auth/login', '/auth/register']))
    expect(SIGNED_IN_ROUTES).toEqual(['/profile', '/auth/verify-otp'])
    expect(capturedRoutes()).toEqual(expect.arrayContaining(['/auth/login', '/auth/register']))
  })
})
// @server:auth-end
