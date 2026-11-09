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

import { loginForm } from '../auth.form'

// The sign-in screen. The store toasts every failure but `validation_failed`; that one lands on
// the fields, and the page toasts only for the paths no field shows. `next` (the route's query
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  protected readonly store = inject(AuthStore)
  private readonly router = inject(Router)
  private readonly notifications = inject(NotificationService)

  readonly next = input<string | undefined>(undefined)
  protected readonly form = loginForm()

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.store.loading()) return
    if (await this.store.login(this.form.getRawValue())) {
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
