import { Injectable, inject } from '@angular/core'
import type { TranslocoMissingHandler } from '@jsverse/transloco'

import { LoggerService } from '../providers/logger.service'

// A key with no text shows as the key itself, so a gap is visible and never blank. The logger
// warns in development and stays quiet in production (it keeps `error` only there).
@Injectable()
export class MissingKeyHandler implements TranslocoMissingHandler {
  private readonly logger = inject(LoggerService)

  handle(key: string): string {
    this.logger.warn(`Missing translation key: ${key}`)
    return key
  }
}
