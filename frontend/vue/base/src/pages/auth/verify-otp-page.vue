<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { PROFILE_PATH } from '@/models/user/constants'
import BaseButton from '@/shared/components/base-button.vue'
import BaseInput from '@/shared/components/base-input.vue'
import AuthCard from '@/shared/components/auth-card.vue'
import FormActions from '@/shared/components/form-actions.vue'
import FormField from '@/shared/components/form-field.vue'
import { applyFieldErrors } from '@/shared/validators/server-errors'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'

import { otpForm } from './auth.form'

// Verifying the signed-in account's address: ask for a code, enter the six digits, done. The OTP
// calls need a session, so the route sits behind authGuard; this is not a way to sign in.
const auth = useAuthStore()
const { loading, user } = storeToRefs(auth)
const notifications = useNotificationStore()
const router = useRouter()
const form = otpForm()
const sent = ref(false)

async function sendCode(): Promise<void> {
  if (loading.value) return
  if (await auth.requestOtp()) {
    sent.value = true
    notifications.showSuccess('auth.otp.sent')
  }
}

async function submit(): Promise<void> {
  await form.submit(async ({ code }) => {
    if (await auth.verifyOtp(code)) {
      notifications.showSuccess('auth.otp.verified')
      await router.push(PROFILE_PATH)
      return
    }
    const error = auth.error
    if (error?.code !== 'validation_failed') return
    const unmapped = applyFieldErrors(form, error)
    if (unmapped.length > 0 || !error.fieldErrors) {
      notifications.showError('errors.validation_failed')
    }
  })
}
</script>

<template>
  <AuthCard
    :heading="$t('auth.otp.title')"
    :description="$t('auth.otp.description', { email: user?.email ?? '' })"
  >
    <BaseButton v-if="!sent" class="verify-otp__send" :loading="loading" @click="sendCode">{{
      $t('auth.otp.send')
    }}</BaseButton>
    <form v-else class="verify-otp__form" novalidate @submit.prevent="submit">
      <FormField
        :label="$t('auth.otp.code')"
        :hint="$t('auth.otp.hint')"
        :error="form.errorText('code')"
      >
        <BaseInput
          v-model="form.values.code"
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="123456"
          @blur="form.touch('code')"
        />
      </FormField>
      <FormActions submit-key="auth.otp.verify" :pending="loading" />
    </form>
    <template #footer>
      <p class="verify-otp__alt">
        <BaseButton v-if="sent" variant="ghost" size="sm" :disabled="loading" @click="sendCode">{{
          $t('auth.otp.resend')
        }}</BaseButton>
        <BaseButton variant="ghost" size="sm" :to="PROFILE_PATH">{{
          $t('auth.otp.back')
        }}</BaseButton>
      </p>
    </template>
  </AuthCard>
</template>

<style lang="scss" src="./verify-otp-page.scss"></style>
