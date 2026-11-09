import type { RouteRecordRaw } from 'vue-router'

// The home screen, inside the main layout. app/routes.ts composes it.
const routes: RouteRecordRaw[] = [
  {
    path: '',
    component: () => import('./health-status-page.vue'),
    meta: { titleKey: 'health.title' },
  },
]

export default routes
