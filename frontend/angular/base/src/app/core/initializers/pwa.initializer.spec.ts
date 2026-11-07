import { ApplicationInitStatus } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { AppUpdateService } from '../providers/app-update.service'
import { InstallPromptService } from '../providers/install-prompt.service'
import { providePwaInitializer } from './pwa.initializer'

describe('providePwaInitializer', () => {
  it('starts the update checks and listens for the install prompt before the app starts', async () => {
    const start = vi.fn()
    TestBed.configureTestingModule({
      providers: [{ provide: AppUpdateService, useValue: { start } }, providePwaInitializer()],
    })
    await TestBed.inject(ApplicationInitStatus).donePromise
    expect(start).toHaveBeenCalledOnce()
    const service = TestBed.inject(InstallPromptService)
    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }))
    expect(service.canInstall()).toBe(true)
  })
})
