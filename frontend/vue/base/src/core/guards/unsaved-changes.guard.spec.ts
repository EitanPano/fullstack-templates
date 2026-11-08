/* eslint-disable vue/one-component-per-file -- a host and the page under test are two small components */
import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { Page } from '@/testing/stubs'

import { useUnsavedChangesGuard } from './unsaved-changes.guard'

const dirty = ref(false)

const Host = defineComponent({ render: () => h(RouterView) })

const Editor = defineComponent({
  setup() {
    const guard = useUnsavedChangesGuard(() => dirty.value)
    return () =>
      h('div', [
        h('p', guard.open.value ? 'asking' : 'quiet'),
        h('button', { onClick: guard.confirm }, 'leave'),
        h('button', { onClick: guard.cancel }, 'stay'),
      ])
  },
})

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/edit', component: Editor },
      { path: '/elsewhere', component: Page },
    ],
  })
  await router.push('/edit')
  render(Host, { global: { plugins: [router] } })
  return router
}

describe('useUnsavedChangesGuard', () => {
  it('lets the route go when nothing changed', async () => {
    dirty.value = false
    const router = await mount()

    await router.push('/elsewhere')

    expect(router.currentRoute.value.path).toBe('/elsewhere')
  })

  it('holds the route and asks while there are unsaved changes', async () => {
    dirty.value = true
    const router = await mount()

    const navigation = router.push('/elsewhere')
    await Promise.resolve()
    await Promise.resolve()

    expect(router.currentRoute.value.path).toBe('/edit')
    expect(await screen.findByText('asking')).toBeInTheDocument()
    screen.getByRole('button', { name: 'leave' }).click()
    await navigation
    expect(router.currentRoute.value.path).toBe('/elsewhere')
  })

  it('stays on the page when the answer is no', async () => {
    dirty.value = true
    const router = await mount()

    const navigation = router.push('/elsewhere')
    await screen.findByText('asking')
    screen.getByRole('button', { name: 'stay' }).click()
    await navigation

    expect(router.currentRoute.value.path).toBe('/edit')
    expect(await screen.findByText('quiet')).toBeInTheDocument()
  })
})
