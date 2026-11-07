import { ChangeDetectionStrategy, Component, input } from '@angular/core'

// The page's one h1, an optional description, and an `actions` slot: content carrying the
// `actions` attribute lands on the right. `heading` and `description` arrive already translated.
@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly heading = input.required<string>()
  readonly description = input<string | null>(null)
}
