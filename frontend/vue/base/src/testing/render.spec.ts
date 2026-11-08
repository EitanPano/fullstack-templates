import { screen } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { useRoute } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from './render'
import { Greeting } from './stubs'

const Probe = defineComponent({
  setup() {
    const route = useRoute()
    return () => h('p', `at ${route.path}`)
  },
})

describe('renderWithApp', () => {
  it('renders a component inside a testing pinia and a memory router', async () => {
    const { pinia, router } = await renderWithApp(Probe, { route: '/somewhere' })

    expect(screen.getByText('at /somewhere')).toBeInTheDocument()
    expect(pinia).toBeDefined()
    expect(router.currentRoute.value.path).toBe('/somewhere')
  })

  it('starts at the root when no route is given', async () => {
    await renderWithApp(Probe)

    expect(screen.getByText('at /')).toBeInTheDocument()
  })
})

describe('renderWithApp copy', () => {
  it('installs the English copy, so a component translates with $t', async () => {
    await renderWithApp(Greeting)

    expect(screen.getByText('Skip to content')).toBeInTheDocument()
  })
})
