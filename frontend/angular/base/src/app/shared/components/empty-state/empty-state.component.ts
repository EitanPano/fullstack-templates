import { ChangeDetectionStrategy, Component, input } from '@angular/core'

import { IconComponent, type IconName } from '../icon/icon.component'

// What a list shows when it has nothing: an icon, a title, a description and, in the `actions`
// slot, the way to add the first item. `heading` and `description` arrive already translated.
@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly heading = input.required<string>()
  readonly description = input<string | null>(null)
  readonly icon = input<IconName>('inbox')
}
