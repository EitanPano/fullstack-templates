import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'

import { injectFormSubmit } from '@app/core/providers/form-submit'
import { AuthCardComponent } from '@app/shared/components/auth-card/auth-card.component'
import { FormActionsComponent } from '@app/shared/components/form/form-actions/form-actions.component'
import { FormFieldComponent } from '@app/shared/components/form/form-field/form-field.component'
import { InputComponent } from '@app/shared/components/form/input/input.component'
import { AutofocusDirective } from '@app/shared/directives/autofocus.directive'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'
import { safeNextPath } from '@app/shared/utils/next-path'
import { AuthStore } from '@app/store/auth.store'

import { loginForm } from '../auth.form'

// The sign-in screen. The store toasts every failure but `validation_failed`, which the submit
// puts on the fields. `next` (the route's query
// parameter) is where to go after signing in; anything but a path on this site is the home page.
@Component({
  selector: 'app-login',
  imports: [
    AuthCardComponent,
    AutofocusDirective,
    FormActionsComponent,
    FormFieldComponent,
    InputComponent,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  protected readonly store = inject(AuthStore)
  private readonly router = inject(Router)

  readonly next = input<string | undefined>(undefined)
  protected readonly form = loginForm()
  protected readonly submission = injectFormSubmit(this.form)

  protected async submit(): Promise<void> {
    const outcome = await this.submission.run(() => this.store.login(this.form.getRawValue()))
    if (outcome.ok) await this.router.navigateByUrl(safeNextPath(this.next()))
  }
}
