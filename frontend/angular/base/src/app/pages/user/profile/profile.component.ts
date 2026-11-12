import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'

import { injectFormSubmit } from '@app/core/providers/form-submit'
import { NotificationService } from '@app/core/providers/notification.service'
import { errorMessageKey } from '@app/core/config/error-copy'
import { ROLE_LABEL_KEYS } from '@app/models/user/constant'
import { ButtonComponent } from '@app/shared/components/button/button.component'
import { ErrorStateComponent } from '@app/shared/components/error-state/error-state.component'
import { FormActionsComponent } from '@app/shared/components/form/form-actions/form-actions.component'
import { FormFieldComponent } from '@app/shared/components/form/form-field/form-field.component'
import { InputComponent } from '@app/shared/components/form/input/input.component'
import { PageComponent } from '@app/shared/components/page/page.component'
import { PageHeaderComponent } from '@app/shared/components/page-header/page-header.component'
import { SkeletonComponent } from '@app/shared/components/skeleton/skeleton.component'
import { RelativeTimePipe } from '@app/shared/pipes/relative-time.pipe'
import { TranslatePipe } from '@app/shared/pipes/translate.pipe'
import { AuthStore } from '@app/store/auth.store'
import { UserStore } from '@app/store/user.store'

import { profileForm } from '../user.form'

// The signed-in account: e-mail, role, when it was created, whether the address is verified, its
// phone number (the one editable field) and sign-out. Leaving with an unsaved phone number asks
// first (unsavedChangesGuard on the route).
@Component({
  selector: 'app-profile',
  imports: [
    ButtonComponent,
    ErrorStateComponent,
    FormActionsComponent,
    FormFieldComponent,
    InputComponent,
    PageComponent,
    PageHeaderComponent,
    ReactiveFormsModule,
    RelativeTimePipe,
    SkeletonComponent,
    TranslatePipe,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  protected readonly store = inject(UserStore)
  protected readonly auth = inject(AuthStore)
  private readonly notifications = inject(NotificationService)

  protected readonly form = profileForm()
  protected readonly submission = injectFormSubmit(this.form)
  protected readonly roleKey = computed(() => {
    const role = this.store.profile()?.role
    return role ? ROLE_LABEL_KEYS[role] : ''
  })
  protected readonly errorKey = computed(() =>
    errorMessageKey(this.store.error('load')?.code ?? 'unknown'),
  )

  constructor() {
    void this.store.load()
    // Fills the form from the loaded profile, and again after a save, so it is pristine.
    effect(() => {
      const profile = this.store.profile()
      if (!profile) return
      untracked(() => {
        this.form.reset({ phone: profile.phone ?? '' })
      })
    })
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty
  }

  protected retry(): void {
    void this.store.load()
  }

  protected async save(): Promise<void> {
    const phone = this.form.getRawValue().phone
    const outcome = await this.submission.run(() =>
      this.store.update({ phone: phone === '' ? null : phone }),
    )
    if (outcome.ok) this.notifications.showSuccess('profile.saved')
  }

  protected signOut(): void {
    void this.auth.logout()
  }
}
