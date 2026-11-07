import { DOCUMENT } from '@angular/common'
import { ApplicationRef, DestroyRef, Injectable, InjectionToken, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { SwUpdate, type VersionEvent } from '@angular/service-worker'
import { first, fromEvent, interval, switchMap, throttleTime } from 'rxjs'

import { LoggerService } from './logger.service'
import { NotificationService } from './notification.service'

const HOUR_MS = 60 * 60 * 1000
const FOCUS_THROTTLE_MS = 5 * 60 * 1000

// How the page reloads; a token so a spec can observe it instead of navigating.
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT)
    return () => {
      document.location.reload()
    }
  },
})

// Keeps the installed app current. The service worker downloads a new version in the background;
// this tells the user it is ready and, on their say, activates it and reloads. It checks for a
// version at start, every hour once the app is stable (an `interval` would otherwise keep the app
// from ever becoming stable) and when the window regains focus (at most every five minutes).
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate)
  private readonly notifications = inject(NotificationService)
  private readonly logger = inject(LoggerService)
  private readonly appRef = inject(ApplicationRef)
  private readonly document = inject(DOCUMENT)
  private readonly reload = inject(RELOAD_PAGE)
  private readonly destroyRef = inject(DestroyRef)

  start(): void {
    if (!this.updates.isEnabled) return

    this.updates.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.onVersion(event)
    })
    this.updates.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.notifications.showWarning('pwa.unrecoverable', undefined, {
        labelKey: 'pwa.reload',
        run: this.reload,
      })
    })

    this.check()
    this.appRef.isStable
      .pipe(
        first((stable) => stable),
        switchMap(() => interval(HOUR_MS)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.check()
      })
    const view = this.document.defaultView
    if (view) {
      fromEvent(view, 'focus')
        .pipe(throttleTime(FOCUS_THROTTLE_MS), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.check()
        })
    }
  }

  private onVersion(event: VersionEvent): void {
    if (event.type === 'VERSION_INSTALLATION_FAILED') {
      this.logger.error('Service worker could not install a new version', event.error)
      return
    }
    if (event.type !== 'VERSION_READY') return
    this.notifications.showInfo('pwa.updateReady', undefined, {
      labelKey: 'pwa.reload',
      run: () => {
        this.updates
          .activateUpdate()
          .then(() => {
            this.reload()
          })
          .catch((error: unknown) => {
            this.logger.error('Activating the new version failed', error)
          })
      },
    })
  }

  private check(): void {
    this.updates.checkForUpdate().catch((error: unknown) => {
      this.logger.error('Checking for an update failed', error)
    })
  }
}
