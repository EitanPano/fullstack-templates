import { describe, expect, it } from 'vitest'

import en from '@/core/i18n/translations/en.json'

import routes from './health.routes'

describe('health routes', () => {
  it('serves the status page at the root of the layout, titled from the copy table', () => {
    expect(routes).toHaveLength(1)
    expect(routes[0]?.path).toBe('')
    expect(routes[0]?.meta?.titleKey).toBe('health.title')
    expect(en.health.title).toBe('System status')
    expect(typeof routes[0]?.component).toBe('function')
  })
})
