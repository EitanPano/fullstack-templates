<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useUnsavedChangesGuard } from '@/core/guards/unsaved-changes.guard'
import { errorMessageKey } from '@/core/config/error-copy'
import { ROLE_LABEL_KEYS, VERIFY_OTP_PATH } from '@/models/user/constant'
import BaseButton from '@/shared/components/base-button/base-button.vue'
import BaseInput from '@/shared/components/form/base-input.vue'
import BaseSkeleton from '@/shared/components/base-skeleton/base-skeleton.vue'
import ConfirmDialog from '@/shared/components/confirm-dialog/confirm-dialog.vue'
import ErrorState from '@/shared/components/error-state/error-state.vue'
import FormActions from '@/shared/components/form/form-actions/form-actions.vue'
import FormField from '@/shared/components/form/form-field/form-field.vue'
import PageContainer from '@/shared/components/page-container/page-container.vue'
import PageHeader from '@/shared/components/page-header/page-header.vue'
import { relativeTime } from '@/shared/utils/relative-time'
import { applyFieldErrors } from '@/shared/validators/server-errors'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'
import { useUserStore } from '@/store/user.store'

import { profileForm } from '../user.form'

// The signed-in account: e-mail, role, when it was created, whether the address is verified, its
// phone number (the one editable field) and sign-out. Leaving with an unsaved phone number asks
// first.
const store = useUserStore()
const auth = useAuthStore()
const notifications = useNotificationStore()
const router = useRouter()
const { locale } = useI18n()
const { profile, loading, failed, error } = storeToRefs(store)
const form = profileForm()
// No account, no question: after sign-out the store has dropped the profile while the field still
// holds what was typed, and that is not an unsaved change of anyone.
const leaving = useUnsavedChangesGuard(
  () =>
    auth.isLoggedIn && profile.value !== null && form.values.phone !== (profile.value.phone ?? ''),
)

const roleKey = computed(() => (profile.value ? ROLE_LABEL_KEYS[profile.value.role] : ''))
const errorKey = computed(() => errorMessageKey(error.value?.code ?? 'unknown'))

// Fills the form from the loaded profile, and again after a save, so it is pristine.
watch(
  profile,
  (current) => {
    if (current) form.values.phone = current.phone ?? ''
  },
  { immediate: true },
)

void store.load()

async function save(): Promise<void> {
  await form.submit(async ({ phone }) => {
    if (await store.update({ phone: phone === '' ? null : phone })) {
      notifications.showSuccess('profile.saved')
      return
    }
    const failure = store.error
    if (failure?.code !== 'validation_failed') return
    const unmapped = applyFieldErrors(form, failure)
    if (unmapped.length > 0 || !failure.fieldErrors) {
      notifications.showError('errors.validation_failed')
    }
  })
}

async function signOut(): Promise<void> {
  if (await auth.logout()) await router.push('/')
}
</script>

<template>
  <PageContainer>
    <section class="profile">
      <PageHeader :heading="$t('profile.title')" :description="$t('profile.description')">
        <template #actions>
          <BaseButton variant="secondary" @click="signOut">{{
            $t('auth.menu.signOut')
          }}</BaseButton>
        </template>
      </PageHeader>

      <ErrorState v-if="failed && !profile" :description="$t(errorKey)" @retry="store.load()" />
      <template v-else-if="profile">
        <dl class="profile__facts">
          <div class="profile__fact">
            <dt>{{ $t('profile.email') }}</dt>
            <dd>{{ profile.email }}</dd>
          </div>
          <div class="profile__fact">
            <dt>{{ $t('profile.role') }}</dt>
            <dd>{{ $t(roleKey) }}</dd>
          </div>
          <div class="profile__fact">
            <dt>{{ $t('profile.created') }}</dt>
            <dd>{{ relativeTime(profile.createdAt, locale) }}</dd>
          </div>
          <div class="profile__fact">
            <dt>{{ $t('profile.verification') }}</dt>
            <dd>
              <template v-if="profile.emailVerifiedAt">{{ $t('profile.verified') }}</template>
              <template v-else>
                {{ $t('profile.unverified') }}
                <BaseButton variant="ghost" size="sm" :to="VERIFY_OTP_PATH">{{
                  $t('profile.verify')
                }}</BaseButton>
              </template>
            </dd>
          </div>
        </dl>

        <form class="profile__form" novalidate @submit.prevent="save">
          <FormField
            :label="$t('profile.phone')"
            :hint="$t('profile.phoneHint')"
            :error="form.errorText('phone')"
          >
            <BaseInput
              v-model="form.values.phone"
              type="tel"
              name="phone"
              autocomplete="tel"
              inputmode="tel"
              @blur="form.touch('phone')"
            />
          </FormField>
          <FormActions submit-key="profile.save" :pending="loading" />
        </form>
      </template>
      <div v-else class="profile__loading" role="status" aria-busy="true">
        <span class="visually-hidden">{{ $t('app.loading') }}</span>
        <BaseSkeleton variant="block" size="md" />
        <BaseSkeleton :lines="3" />
      </div>

      <ConfirmDialog
        v-model:open="leaving.open.value"
        :title="$t('guards.unsaved.title')"
        :message="$t('guards.unsaved.message')"
        :confirm-label="$t('guards.unsaved.leave')"
        danger
        @confirm="leaving.confirm"
        @cancel="leaving.cancel"
      />
    </section>
  </PageContainer>
</template>

<style lang="scss" src="./profile-page.scss"></style>
