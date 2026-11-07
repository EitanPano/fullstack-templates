import { inject, provideAppInitializer, type EnvironmentProviders } from '@angular/core'

import { AppUpdateService } from '../providers/app-update.service'
import { InstallPromptService } from '../providers/install-prompt.service'

// Starts the update checks and begins listening for the install prompt before the first render, so
// an early `beforeinstallprompt` is not missed.
export function providePwaInitializer(): EnvironmentProviders {
  return provideAppInitializer(() => {
    inject(InstallPromptService)
    inject(AppUpdateService).start()
  })
}
