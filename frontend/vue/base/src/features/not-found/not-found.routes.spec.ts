import { describe, expect, it } from 'vitest'

import { NAV } from '@/app/nav'
import { routes } from '@/app/routes'

import notFoundRoutes from './not-found.routes'

describe('not-found routes', () => {
  it('is a catch-all with a title key', () => {
    expect(notFoundRoutes).toHaveLength(1)
    expect(notFoundRoutes[0]?.path).toBe('/:pathMatch(.*)*')
    expect(notFoundRoutes[0]?.meta).toEqual({ titleKey: 'notFound.title' })
  })

  it('sits inside the main layout of the route table, after every feature', () => {
    const layout = routes[0]

    expect(layout?.props).toEqual({ nav: NAV })
    expect(layout?.children?.at(-1)?.path).toBe('/:pathMatch(.*)*')
  })
})
