import { createTestingPinia } from '@pinia/testing'
import { render } from '@testing-library/vue'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { vi } from 'vitest'

import { routes as appRoutes } from '@/app/routes'
import { DEV_KEY } from '@/shared/composables/dev-mode'
import { createAppI18n } from '@/core/i18n/i18n'

type Options = {
  // The memory history's start; the root by default.
  route?: string
  // A testing Pinia state to start from; actions run for real (stubActions: false).
  initialState?: Record<string, unknown>
  // Props and slots of the component under test.
  props?: Record<string, unknown>
  slots?: Record<string, unknown>
  // Development mode, which turns on developer warnings; on by default as in the dev server.
  dev?: boolean
  // The route table; the app's own by default.
  routes?: RouteRecordRaw[]
  // The i18n instance to install; a fresh English one by default.
  i18n?: ReturnType<typeof createAppI18n>
}

// Renders a component the way the app mounts it: a testing Pinia, a memory-history router over the
// real route table, and the English copy in memory. Resolves once the first navigation settled.
export async function renderWithApp(component: Component, options: Options = {}) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: false,
    initialState: options.initialState,
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: options.routes ?? appRoutes,
  })
  await router.push(options.route ?? '/')
  await router.isReady()
  const i18n = options.i18n ?? createAppI18n()
  const view = render(component, {
    props: options.props,
    slots: options.slots,
    global: {
      plugins: [pinia, router, i18n],
      provide: { [DEV_KEY as symbol]: options.dev ?? true },
    },
  })
  return { ...view, pinia, router, i18n }
}
