import { Routes } from '@angular/router'

import { authGuard, guestGuard } from '@app/core/guards/auth.guard'

// Under the auth layout: sign-in and register are for visitors; verify-otp is a verification step
// for an account that is already signed in (the OTP calls need a session), not a sign-in method.
const AUTH_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canMatch: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./pages/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'verify-otp',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./pages/verify-otp/verify-otp.component').then((m) => m.VerifyOtpComponent),
  },
]

export default AUTH_ROUTES
