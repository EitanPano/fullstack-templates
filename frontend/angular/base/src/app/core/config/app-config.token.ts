import { InjectionToken } from '@angular/core'

import { environment } from '../../../environments/environment'

export interface AppConfig {
  readonly production: boolean
}

// Build-time settings. There is no API URL (the API is at relative `/api`) and no secret.
export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => environment,
})
