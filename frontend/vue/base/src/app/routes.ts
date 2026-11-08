import type { RouteRecordRaw } from 'vue-router'

import { NAV } from '@/app/nav'
import authRoutes from '@/features/auth/auth.routes' // @server:auth
import forbiddenRoutes from '@/features/forbidden/forbidden.routes' // @server:auth
import healthRoutes from '@/features/health/health.routes'
import notFoundRoutes from '@/features/not-found/not-found.routes'
import userRoutes from '@/features/user/user.routes' // @server:auth
import AuthLayout from '@/layout/auth-layout/auth-layout.vue' // @server:auth
import MainLayout from '@/layout/main-layout/main-layout.vue'

// The route table, composed here and nowhere else. Every feature contributes one lazy
// `*.routes.ts` file under the main layout, which receives the nav table as a prop (layout/ may
// not import app/); the catch-all comes last. The account screens (sign-in, register, the OTP
// step) sit under the auth layout, which has no shell.
export const routes: RouteRecordRaw[] = [
  {
    path: '',
    component: MainLayout,
    props: { nav: NAV },
    children: [
      ...healthRoutes,
      ...userRoutes, // @server:auth
      ...forbiddenRoutes, // @server:auth
      ...notFoundRoutes,
    ],
  },
  // @server:auth-start
  { path: '/auth', component: AuthLayout, children: authRoutes },
  // @server:auth-end
]
