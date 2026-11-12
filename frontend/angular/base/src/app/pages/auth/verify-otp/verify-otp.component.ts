import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'

import { injectFormSubmit } from '@app/core/providers/form-submit'
import { NotificationService } from '@app/core/providers/notification.service'
import { PROFILE_PATH } from '@app/models/user/constant'
import { AuthCardComponent } from '@app/shared/components/auth-card/auth-card.component'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { FormActionsComponent } from '@app/shared/components/form/form-actions/form-actions.component'
import { FormFieldComponent } from '@app/shared/components/form/form-field/form-field.component'
import { InputComponent } from '@app/shared/components/form/input/input.component'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'
import { AuthStore } from '@app/store/auth.store'

import { otpForm } from '../auth.form'

// Verifying the signed-in account's address: ask for a code, enter the six digits, done. The OTP
// calls need a session, so the route sits behind authGuard; this is not a way to sign in.
@Component({
  selector: 'app-verify-otp',
  imports: [
    AuthCardComponent,
    ButtonComponent,
    FormActionsComponent,
    FormFieldComponent,
    InputComponent,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  templateUrl: './verify-otp.component.html',
  styleUrl: './verify-otp.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyOtpComponent {
  protected readonly store = inject(AuthStore)
  private readonly router = inject(Router)
  private readonly notifications = inject(NotificationService)

  protected readonly sent = signal(false)
  protected readonly form = otpForm()
  protected readonly submission = injectFormSubmit(this.form)

  protected async sendCode(): Promise<void> {
    if (this.store.loading('requestOtp')) return
    if ((await this.store.requestOtp()).ok) {
      this.sent.set(true)
      this.notifications.showSuccess('auth.otp.sent')
    }
  }

  protected async submit(): Promise<void> {
    const code = this.form.getRawValue().code
    const outcome = await this.submission.run(() => this.store.verifyOtp(code))
    if (!outcome.ok) return
    this.notifications.showSuccess('auth.otp.verified')
    await this.router.navigateByUrl(PROFILE_PATH)
  }
}
