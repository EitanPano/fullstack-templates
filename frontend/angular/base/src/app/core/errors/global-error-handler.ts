import { ErrorHandler, Injectable, inject } from '@angular/core'

import { LoggerService } from '../providers/logger.service'
import { NotificationService } from '../providers/notification.service'

const UNEXPECTED = 'errors.unexpected'

// The last resort for an error nothing caught: log it and tell the user once. An error a handler
// can name (a failed save, a rejected login) is shown there, not here.
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly logger = inject(LoggerService)
  private readonly notifications = inject(NotificationService)

  handleError(error: unknown): void {
    this.logger.error('Unhandled error', error)
    if (this.notifications.toasts().some((toast) => toast.messageKey === UNEXPECTED)) return
    this.notifications.showError(UNEXPECTED)
  }
}
