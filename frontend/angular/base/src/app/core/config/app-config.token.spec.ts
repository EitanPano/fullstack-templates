import { TestBed } from '@angular/core/testing'

import { APP_CONFIG } from './app-config.token'

describe('APP_CONFIG', () => {
  it('exposes the build-time environment, with no API URL', () => {
    const config = TestBed.inject(APP_CONFIG)
    expect(config.production).toBe(false)
    expect(Object.keys(config)).not.toContain('apiUrl')
  })
})
