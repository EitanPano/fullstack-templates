import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'

import { errorMessageKey } from '@app/models/api/error-copy'
import { HealthStore } from '@app/store/health.store'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { ErrorStateComponent } from '@app/shared/components/error-state/error-state.component'
import { PageHeaderComponent } from '@app/shared/components/page-header/page-header.component'
import { SkeletonComponent } from '@app/shared/components/skeleton/skeleton.component'
import { RelativeTimePipe } from '@app/shared/pipes/relative-time.pipe'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

import { HealthBadgeComponent } from '../components/health-badge/health-badge.component'

// The home screen: whether the server answers, its version and how long it has been up. The page
// reads the store and never a service; the store toasts the failure, the page shows the retry.
@Component({
  selector: 'app-health-status',
  imports: [
    ButtonComponent,
    ErrorStateComponent,
    HealthBadgeComponent,
    PageHeaderComponent,
    RelativeTimePipe,
    SkeletonComponent,
    TranslatePipe,
  ],
  templateUrl: './health-status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthStatusComponent {
  protected readonly store = inject(HealthStore)
  protected readonly errorKey = computed(() =>
    errorMessageKey(this.store.error()?.code ?? 'unknown'),
  )

  constructor() {
    void this.store.load()
  }

  protected refresh(): void {
    void this.store.load()
  }
}
