import { afterEach, describe, expect, it } from 'vitest'

import { DISPLAY_NAME } from '@/core/config/constants'

import { router } from './router'

describe('router', () => {
  afterEach(async () => {
    document.title = ''
    await router.replace('/')
  })

  it('titles the document from the route titleKey and the product name', async () => {
    await router.push('/no/such/page')

    expect(document.title).toBe(`Page not found · ${DISPLAY_NAME}`)
  })

  it('serves the health status page at the root', async () => {
    await router.push('/')

    expect(document.title).toBe(`System status · ${DISPLAY_NAME}`)
  })

  it('titles a route without a key by the product name alone', async () => {
    await router.push('/')
    router.addRoute({ path: '/bare', component: { render: () => null } })
    await router.push('/bare')

    expect(document.title).toBe(DISPLAY_NAME)
    router.removeRoute('/bare')
  })
})
