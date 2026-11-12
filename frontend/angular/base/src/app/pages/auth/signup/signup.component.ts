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

import { signupForm } from '../auth.form'

// The signup screen: creates the account, which signs it in, and sends it to `next` or home.
// Failures follow the login screen's rule (the store toasts, the submit puts validation on the
// fields).
@Component({
  selector: 'app-signup',
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
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  protected readonly store = inject(AuthStore)
  private readonly router = inject(Router)

  readonly next = input<string | undefined>(undefined)
  protected readonly form = signupForm()
  protected readonly submission = injectFormSubmit(this.form)

  protected async submit(): Promise<void> {
    const { email, password } = this.form.getRawValue()
    const outcome = await this.submission.run(() => this.store.signup({ email, password }))
    if (outcome.ok) await this.router.navigateByUrl(safeNextPath(this.next()))
  }
}
