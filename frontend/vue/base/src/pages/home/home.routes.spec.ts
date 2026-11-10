import { describe, expect, it } from 'vitest'

import en from '@/core/i18n/translations/en.json'

import routes from './home.routes'

describe('home routes', () => {
  it('serves the index route at the root of the layout, titled from the copy table', () => {
    expect(routes).toHaveLength(1)
    expect(routes[0]?.path).toBe('')
    expect(routes[0]?.meta?.titleKey).toBe('nav.home')
    expect(en.nav.home).toBe('Home')
    expect(typeof routes[0]?.component).toBe('function')
  })
})
