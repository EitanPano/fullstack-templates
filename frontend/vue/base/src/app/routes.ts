import type { RouteRecordRaw } from 'vue-router'

import authRoutes from '@/pages/auth/auth.routes' // @server:auth
import forbiddenRoutes from '@/pages/forbidden/forbidden.routes' // @server:auth
import homeRoutes from '@/pages/home/home.routes'
import notFoundRoutes from '@/pages/not-found/not-found.routes'
import userRoutes from '@/pages/user/user.routes' // @server:auth
import AppAuthLayout from '@/layout/app-auth-layout/app-auth-layout.vue' // @server:auth
import AppMainLayout from '@/layout/app-main-layout/app-main-layout.vue'

// The route table, composed here and nowhere else. Every feature contributes one lazy
// `*.routes.ts` file under the main layout (the skip link, `main` and the toasts); the catch-all
// comes last. The account screens (sign-in, signup, the OTP step) sit under the auth layout.
export const routes: RouteRecordRaw[] = [
  {
    path: '',
    component: AppMainLayout,
    children: [
      ...homeRoutes,
      ...userRoutes, // @server:auth
      ...forbiddenRoutes, // @server:auth
      ...notFoundRoutes,
    ],
  },
  // @server:auth-start
  { path: '/auth', component: AppAuthLayout, children: authRoutes },
  // @server:auth-end
]
