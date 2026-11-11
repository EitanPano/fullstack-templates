import type { RouteRecordRaw } from 'vue-router'

// The catch-all, inside the main layout: an unknown path shows a not-found page inside the main layout.
// app/routes.ts puts it last.
const routes: RouteRecordRaw[] = [
  {
    path: '/:pathMatch(.*)*',
    component: () => import('./not-found-page/not-found-page.vue'),
    meta: { titleKey: 'notFound.title' },
  },
]

export default routes
