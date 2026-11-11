import type { RouteRecordRaw } from 'vue-router'

// The target of roleGuard for an account that holds the wrong role; open to anyone.
const routes: RouteRecordRaw[] = [
  {
    path: 'forbidden',
    component: () => import('./forbidden-page/forbidden-page.vue'),
    meta: { titleKey: 'forbidden.title' },
  },
]

export default routes
