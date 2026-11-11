<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { NEXT_PARAM } from '@/models/user/constant'
import BaseInput from '@/shared/components/form/base-input.vue'
import AuthCard from '@/shared/components/auth-card/auth-card.vue'
import FormActions from '@/shared/components/form/form-actions/form-actions.vue'
import FormField from '@/shared/components/form/form-field/form-field.vue'
import { autofocus as vAutofocus } from '@/shared/directives/autofocus'
import { safeNextPath } from '@/shared/utils/next-path'
import { applyFieldErrors } from '@/shared/validators/server-errors'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'

import { signupForm } from '../auth.form'

// The signup screen: creates the account, which signs it in, and sends it to `next` or home.
// Failures follow the login screen's rule (the store toasts, validation lands on the fields);
// a taken email lands on the email field.
const auth = useAuthStore()
const { loading } = storeToRefs(auth)
const notifications = useNotificationStore()
const route = useRoute()
const router = useRouter()
const form = signupForm()

const next = computed(() => {
  const value = route.query[NEXT_PARAM]
  return typeof value === 'string' ? value : undefined
})

async function submit(): Promise<void> {
  await form.submit(async (credentials) => {
    if (await auth.signup(credentials)) {
      await router.push(safeNextPath(next.value))
      return
    }
    const error = auth.error
    if (error?.code === 'conflict') {
      form.serverErrors.email = { messageKey: 'auth.signup.conflict' }
      form.touch('email')
      return
    }
    if (error?.code !== 'validation_failed') return
    const unmapped = applyFieldErrors(form, error)
    if (unmapped.length > 0 || !error.fieldErrors) {
      notifications.showError('errors.validation_failed')
    }
  })
}
</script>

<template>
  <AuthCard :heading="$t('auth.signup.title')" :description="$t('auth.signup.description')">
    <form class="signup__form" novalidate @submit.prevent="submit">
      <FormField :label="$t('auth.email')" :error="form.errorText('email')">
        <BaseInput
          v-model="form.values.email"
          v-autofocus
          type="email"
          name="email"
          autocomplete="email"
          inputmode="email"
          @blur="form.touch('email')"
        />
      </FormField>
      <FormField :label="$t('auth.password')" :error="form.errorText('password')">
        <BaseInput
          v-model="form.values.password"
          type="password"
          name="password"
          autocomplete="new-password"
          @blur="form.touch('password')"
        />
      </FormField>
      <FormField :label="$t('auth.confirm')" :error="form.errorText('confirm')">
        <BaseInput
          v-model="form.values.confirm"
          type="password"
          name="confirm"
          autocomplete="new-password"
          @blur="form.touch('confirm')"
        />
      </FormField>
      <FormActions submit-key="auth.signup.submit" :pending="loading" />
    </form>
    <template #footer>
      <p class="signup__alt">
        {{ $t('auth.signup.hasAccount') }}
        <RouterLink to="/auth/login">{{ $t('auth.signup.loginLink') }}</RouterLink>
      </p>
    </template>
  </AuthCard>
</template>

<style lang="scss" src="./signup-page.scss"></style>
