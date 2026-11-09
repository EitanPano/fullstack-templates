import type { RouteRecordRaw } from 'vue-router'

// The catch-all, inside the main layout: an unknown path shows the shell around a not-found page.
// app/routes.ts puts it last.
const routes: RouteRecordRaw[] = [
  {
    path: '/:pathMatch(.*)*',
    component: () => import('./not-found-page.vue'),
    meta: { titleKey: 'notFound.title' },
  },
]

export default routes
