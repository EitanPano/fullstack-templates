import type { RouteRecordRaw } from 'vue-router'

import { authGuard } from '@/core/guards/auth.guard'

// The signed-in account's profile, inside the main layout.
const routes: RouteRecordRaw[] = [
  {
    path: 'profile',
    component: () => import('./profile-page/profile-page.vue'),
    beforeEnter: authGuard,
    meta: { titleKey: 'profile.title' },
  },
]

export default routes
