import { describe, expect, it } from 'vitest'

import { capturedRoutes, NOT_FOUND } from '../e2e/screen-routes'

// The screens spec captures every nav route, the product's extras and the 404 page, each once.
describe('capturedRoutes', () => {
  it('lists the nav routes, the extras and the 404 address', () => {
    expect(capturedRoutes(['/', '/about'], ['/legal'])).toEqual(['/', '/about', '/legal', NOT_FOUND])
  })

  it('never lists a route twice', () => {
    expect(capturedRoutes(['/', '/about'], ['/about'])).toEqual(['/', '/about', NOT_FOUND])
  })

  it('reads the real nav table by default and always has the index route and the 404', () => {
    const routes = capturedRoutes()
    expect(routes).toContain('/')
    expect(routes).toContain(NOT_FOUND)
    expect(new Set(routes).size).toBe(routes.length)
  })
})
