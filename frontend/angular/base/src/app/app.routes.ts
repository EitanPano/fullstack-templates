import { Routes } from '@angular/router'

import { AuthLayoutComponent } from './layout/auth-layout/auth-layout.component' // @server:auth
import { MainLayoutComponent } from './layout/main-layout/main-layout.component'

export const routes: Routes = [
  // @server:auth-start
  {
    path: 'auth',
    component: AuthLayoutComponent,
    loadChildren: () => import('./features/auth/auth.routes'),
  },
  // @server:auth-end
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadChildren: () => import('./features/health/health.routes'),
      },
      // @server:auth-start
      {
        path: 'profile',
        loadChildren: () => import('./features/user/user.routes'),
      },
      {
        path: 'forbidden',
        loadChildren: () => import('./features/forbidden/forbidden.routes'),
      },
      // @server:auth-end
      {
        path: '**',
        loadChildren: () =>
          import('./features/not-found/not-found.routes').then((m) => m.NOT_FOUND_ROUTES),
      },
    ],
  },
]
