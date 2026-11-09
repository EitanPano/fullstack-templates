import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'

import { HEALTH_STATUS } from '@app/models/health/constants'
import type { HealthStatus } from '@app/models/health/interface'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'

// A status as a coloured pill: the tone and the text come from the status table in models/health,
// so the colour is never the only signal.
@Component({
  selector: 'app-health-badge',
  imports: [TranslatePipe],
  templateUrl: './health-badge.component.html',
  styleUrl: './health-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthBadgeComponent {
  readonly status = input.required<HealthStatus>()

  protected readonly view = computed(() => HEALTH_STATUS[this.status()])
}
