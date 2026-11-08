import { createRouter, createWebHistory } from 'vue-router'

import { routes } from '@/app/routes'
import { DISPLAY_NAME } from '@/core/config/constants'
import { i18n } from '@/core/i18n/i18n'

export const router = createRouter({ history: createWebHistory(), routes })

// The tab title: the route translated `meta.titleKey` and the product name, or the name alone.
router.afterEach((to) => {
  const key = typeof to.meta.titleKey === 'string' ? to.meta.titleKey : null
  document.title = key ? `${i18n.global.t(key)} · ${DISPLAY_NAME}` : DISPLAY_NAME
})
