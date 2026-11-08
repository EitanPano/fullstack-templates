import { describe, expect, it } from 'vitest'

import { env } from './env'

describe('env', () => {
  it('reads the build mode from import.meta.env, parsed once', () => {
    expect(env.MODE).toBe('test')
  })

  it('exposes the dev flag, a boolean', () => {
    expect(typeof env.isDev).toBe('boolean')
  })
})
