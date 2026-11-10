import { Routes } from '@angular/router'

const HOME_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
]

export default HOME_ROUTES
