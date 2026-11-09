import { Routes } from '@angular/router'

const HEALTH_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/health-status/health-status.component').then((m) => m.HealthStatusComponent),
  },
]

export default HEALTH_ROUTES
