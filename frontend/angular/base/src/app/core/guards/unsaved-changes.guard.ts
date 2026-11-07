import { inject } from '@angular/core'
import type { CanDeactivateFn } from '@angular/router'

import { ModalService } from '@app/shared/components/modal/modal.service'

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean
}

// Asks before a page with unsaved edits is left: `canDeactivate: [unsavedChangesGuard]` on a route
// whose component implements `hasUnsavedChanges()`.
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) =>
  component.hasUnsavedChanges()
    ? inject(ModalService).confirm({
        titleKey: 'guards.unsaved.title',
        messageKey: 'guards.unsaved.message',
        confirmKey: 'guards.unsaved.leave',
        danger: true,
      })
    : true
