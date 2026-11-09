import type { RouteRecordRaw } from 'vue-router'

import { authGuard } from '@/core/guards/auth.guard'
import { guestGuard } from '@/core/guards/guest.guard'

// Under the auth layout (app/routes.ts mounts them at /auth): sign-in and register are for
// visitors; verify-otp is a verification step for an account that is already signed in (the OTP
// calls need a session), not a sign-in method.
const routes: RouteRecordRaw[] = [
  { path: '', redirect: '/auth/login' },
  {
    path: 'login',
    component: () => import('./login-page.vue'),
    beforeEnter: guestGuard,
    meta: { titleKey: 'auth.login.title' },
  },
  {
    path: 'register',
    component: () => import('./register-page.vue'),
    beforeEnter: guestGuard,
    meta: { titleKey: 'auth.register.title' },
  },
  {
    path: 'verify-otp',
    component: () => import('./verify-otp-page.vue'),
    beforeEnter: authGuard,
    meta: { titleKey: 'auth.otp.title' },
  },
]

export default routes
