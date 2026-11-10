import { Routes } from '@angular/router'

import { AppAuthLayoutComponent } from './components/app-auth-layout/app-auth-layout.component' // @server:auth
import { AppMainLayoutComponent } from './components/app-main-layout/app-main-layout.component'

export const routes: Routes = [
  // @server:auth-start
  {
    path: 'auth',
    component: AppAuthLayoutComponent,
    loadChildren: () => import('./pages/auth/auth.routes'),
  },
  // @server:auth-end
  {
    path: '',
    component: AppMainLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadChildren: () => import('./pages/home/home.routes'),
      },
      // @server:auth-start
      {
        path: 'profile',
        loadChildren: () => import('./pages/user/user.routes'),
      },
      {
        path: 'forbidden',
        loadChildren: () => import('./pages/forbidden/forbidden.routes'),
      },
      // @server:auth-end
      {
        path: '**',
        loadChildren: () =>
          import('./pages/not-found/not-found.routes').then((m) => m.NOT_FOUND_ROUTES),
      },
    ],
  },
]
