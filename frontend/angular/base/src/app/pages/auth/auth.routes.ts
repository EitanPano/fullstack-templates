import { Routes } from '@angular/router'

import { authGuard, guestGuard } from '@app/core/guards/auth.guard'

// Under the auth layout: sign-in and signup are for visitors; verify-otp is a verification step
// for an account that is already signed in (the OTP calls need a session), not a sign-in method.
const AUTH_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canMatch: [guestGuard],
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    canMatch: [guestGuard],
    loadComponent: () => import('./signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'verify-otp',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./verify-otp/verify-otp.component').then((m) => m.VerifyOtpComponent),
  },
]

export default AUTH_ROUTES
