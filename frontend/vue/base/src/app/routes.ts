import type { RouteRecordRaw } from 'vue-router'

import { NAV } from '@/app/nav'
import authRoutes from '@/pages/auth/auth.routes' // @server:auth
import forbiddenRoutes from '@/pages/forbidden/forbidden.routes' // @server:auth
import healthRoutes from '@/pages/health/health.routes'
import notFoundRoutes from '@/pages/not-found/not-found.routes'
import userRoutes from '@/pages/user/user.routes' // @server:auth
import AppAuthLayout from '@/components/app-auth-layout.vue' // @server:auth
import AppMainLayout from '@/components/app-main-layout.vue'

// The route table, composed here and nowhere else. Every feature contributes one lazy
// `*.routes.ts` file under the main layout, which receives the nav table as a prop (components/ may
// not import app/); the catch-all comes last. The account screens (sign-in, register, the OTP
// step) sit under the auth layout, which has no shell.
export const routes: RouteRecordRaw[] = [
  {
    path: '',
    component: AppMainLayout,
    props: { nav: NAV },
    children: [
      ...healthRoutes,
      ...userRoutes, // @server:auth
      ...forbiddenRoutes, // @server:auth
      ...notFoundRoutes,
    ],
  },
  // @server:auth-start
  { path: '/auth', component: AppAuthLayout, children: authRoutes },
  // @server:auth-end
]
