import { ChangeDetectionStrategy, Component, input } from '@angular/core'

// The card every account screen sits in: the page's one h1, an optional description, the form as
// content and a `footer` slot for the link to the other screen (content carrying the `footer`
// attribute). `heading` and `description` arrive already translated.
@Component({
  selector: 'app-auth-card',
  templateUrl: './auth-card.component.html',
  styleUrl: './auth-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCardComponent {
  readonly heading = input.required<string>()
  readonly description = input<string | null>(null)
}
