import { Routes } from '@angular/router'

// The target of roleGuard for an account that holds the wrong role.
const FORBIDDEN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./forbidden/forbidden.component').then((m) => m.ForbiddenComponent),
  },
]

export default FORBIDDEN_ROUTES
