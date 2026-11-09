import { Routes } from '@angular/router'

import { authGuard } from '@app/core/guards/auth.guard'
import { unsavedChangesGuard } from '@app/core/guards/unsaved-changes.guard'

const USER_ROUTES: Routes = [
  {
    path: '',
    canMatch: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent),
  },
]

export default USER_ROUTES
