import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'

import { NotificationService } from '@app/core/providers/notification.service'
import { AuthCardComponent } from '@app/shared/components/auth-card/auth-card.component'
import { FormActionsComponent } from '@app/shared/components/form-actions/form-actions.component'
import { FormFieldComponent } from '@app/shared/components/form-field/form-field.component'
import { InputComponent } from '@app/shared/components/input/input.component'
import { AutofocusDirective } from '@app/shared/directives/autofocus.directive'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'
import { safeNextPath } from '@app/shared/utils/next-path'
import { applyFieldErrors } from '@app/shared/validators/server-errors'
import { AuthStore } from '@app/store/auth.store'

import { registerForm } from '../../auth.form'

// The register screen: creates the account, which signs it in, and sends it to `next` or home.
// Failures follow the login screen's rule (the store toasts, validation lands on the fields).
@Component({
  selector: 'app-register',
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
  templateUrl: './register.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  protected readonly store = inject(AuthStore)
  private readonly router = inject(Router)
  private readonly notifications = inject(NotificationService)

  readonly next = input<string | undefined>(undefined)
  protected readonly form = registerForm()

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.store.loading()) return
    const { email, password } = this.form.getRawValue()
    if (await this.store.register({ email, password })) {
      await this.router.navigateByUrl(safeNextPath(this.next()))
      return
    }
    const error = this.store.error()
    if (error?.code !== 'validation_failed') return
    const unmapped = applyFieldErrors(this.form, error)
    if (unmapped.length > 0 || !error.fieldErrors) {
      this.notifications.showError('errors.validation_failed')
    }
  }
}
