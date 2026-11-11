import type { RouteRecordRaw } from 'vue-router'

// The index route, inside the main layout. app/routes.ts composes it.
const routes: RouteRecordRaw[] = [
  {
    path: '',
    component: () => import('./home-page.vue'),
    meta: { titleKey: 'nav.home' },
  },
]

export default routes
